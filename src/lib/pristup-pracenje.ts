// Ekran nakon auto-odobravanja kuponom (/pristup?poslano=kupon, docs/kuponi.md „Nakon odobravanja”). Isti preglednik
// nosi kolačić s tokenom praćenja (u bazi samo sha-256, `zahtjevi_pristupa.pracenje_hash`). S njim osoba vidi na koji
// je e-mail pozivnica otišla, može je sama poslati ponovno (novi link, stari prestaje vrijediti; najranije
// PONOVNO_SEKUNDI nakon zadnjeg slanja, najviše MAX_SLANJA) i javiti „Mail nije stigao” (pomoc_at, obavijest
// superadminu, vidi se na /admin/uprava/korisnici). Bez kolačića (drugi preglednik) ekran je samo obavijest.
import { env } from "cloudflare:workers";
import { randomToken, sha256Hex } from "./admin/sesija";
import { PozivOdbijen, izdaj, ispravanToken } from "./admin/pozivi";
import { posaljiPozivnicu } from "./email";
import { obavijesti } from "./obavijesti";

export const KOLACIC_PRACENJA = "__Host-logomedo_pristup";
export const PRACENJE_SATI = 72;
export const PONOVNO_SEKUNDI = 60;
export const MAX_SLANJA = 4;
export const KONTAKT_MAX = 200;
/** `stvorio` pozivnice koju je osoba sama zatražila (stupac „Izdao” na /admin/uprava/korisnici). */
export const SAM_ZATRAZIO = "sam (ponovno slanje)";

export function kolacicPracenja(token: string): string {
  return `${KOLACIC_PRACENJA}=${token}; Path=/; Max-Age=${PRACENJE_SATI * 3600}; HttpOnly; Secure; SameSite=Lax`;
}

export function tokenIzKolacica(cookie: string | null): string | null {
  const m = (cookie ?? "").match(new RegExp(`(?:^|;\\s*)${KOLACIC_PRACENJA}=([A-Za-z0-9_-]{43})(?:;|$)`));
  return m ? m[1] : null;
}

/** Nakon auto-odobravanja (pristup.ts): novi token praćenja, prvo slanje upisano. */
export async function zapocniPracenje(zahtjevId: number, sada = new Date()): Promise<string> {
  const token = randomToken();
  await env.DB.prepare("UPDATE zahtjevi_pristupa SET pracenje_hash = ?, slanja = 1, zadnje_slanje_at = ? WHERE id = ?")
    .bind(await sha256Hex(token), sada.toISOString(), zahtjevId).run();
  return token;
}

export interface Pracenje {
  id: number; email: string; ime: string; kupon: string | null;
  slanja: number; zadnjeSlanje: string | null; pomocAt: string | null;
  /** Sekunde do idućeg dopuštenog slanja (0 = sada). */
  cekajSekundi: number;
  /** Pozivnica iskorištena: osoba je aktivan logoped. */
  prijavljen: boolean;
}

export async function procitajPracenje(token: string | null, sada = new Date()): Promise<Pracenje | null> {
  if (!ispravanToken(token)) return null;
  const r = await env.DB.prepare(
    `SELECT z.id, z.email, z.ime, z.kupon, z.slanja, z.zadnje_slanje_at, z.pomoc_at, z.created_at,
       EXISTS (SELECT 1 FROM korisnici k WHERE k.email = z.email AND k.uloga = 'logoped' AND k.aktivan = 1) AS prijavljen
     FROM zahtjevi_pristupa z WHERE z.pracenje_hash = ? AND z.status = 'odobren'`,
  ).bind(await sha256Hex(token)).first<{
    id: number; email: string; ime: string; kupon: string | null; slanja: number; zadnje_slanje_at: string | null;
    pomoc_at: string | null; created_at: string; prijavljen: number;
  }>();
  if (!r) return null;
  // Kolačić živi PRACENJE_SATI; isto vrijedi i za token (od zahtjeva), da stari kolačić ne bi slao mailove.
  if (sada.getTime() - Date.parse(r.created_at) > PRACENJE_SATI * 3600_000) return null;
  const odZadnjeg = r.zadnje_slanje_at ? (sada.getTime() - Date.parse(r.zadnje_slanje_at)) / 1000 : Infinity;
  return {
    id: r.id, email: r.email, ime: r.ime, kupon: r.kupon, slanja: r.slanja, zadnjeSlanje: r.zadnje_slanje_at, pomocAt: r.pomoc_at,
    cekajSekundi: Math.max(0, Math.ceil(PONOVNO_SEKUNDI - odZadnjeg)), prijavljen: r.prijavljen === 1,
  };
}

export type IshodPonovnog =
  | { ok: true }
  | { ok: false; razlog: "nema" | "rano" | "previse" | "prijavljen" | "greska" };

/**
 * „Pošalji ponovno”: nova pozivnica (stara prestaje vrijediti) na isti e-mail. Mjesto se zauzima atomski
 * (`slanja < MAX` i razmak od PONOVNO_SEKUNDI u istom UPDATE-u), pa dvostruki klik ne šalje dva maila.
 */
export async function posaljiPonovno(
  token: string | null, origin: string, sada = new Date(), dohvat: typeof fetch = fetch,
): Promise<IshodPonovnog> {
  const p = await procitajPracenje(token, sada);
  if (!p) return { ok: false, razlog: "nema" };
  if (p.prijavljen) return { ok: false, razlog: "prijavljen" };
  if (p.slanja >= MAX_SLANJA) return { ok: false, razlog: "previse" };
  const granica = new Date(sada.getTime() - PONOVNO_SEKUNDI * 1000).toISOString();
  const zauzeto = await env.DB.prepare(
    `UPDATE zahtjevi_pristupa SET slanja = slanja + 1, zadnje_slanje_at = ?
     WHERE id = ? AND slanja < ? AND (zadnje_slanje_at IS NULL OR zadnje_slanje_at <= ?) RETURNING id`,
  ).bind(sada.toISOString(), p.id, MAX_SLANJA, granica).first();
  if (!zauzeto) return { ok: false, razlog: "rano" };
  try {
    const poziv = await izdaj({ email: p.email, ime: p.ime }, SAM_ZATRAZIO, sada);
    await env.DB.prepare("UPDATE zahtjevi_pristupa SET poziv_token_hash = ? WHERE id = ?").bind(await sha256Hex(poziv.token), p.id).run();
    const s = await posaljiPozivnicu({ url: `${origin}/admin/poziv#${poziv.token}`, email: poziv.email, istjece: poziv.istjece, ime: p.ime }, dohvat);
    if (s.ok) return { ok: true };
    console.error("pristup: ponovno slanje nije uspjelo", s);
    return { ok: false, razlog: "greska" };
  } catch (e) {
    if (e instanceof PozivOdbijen && e.razlog === "aktivan_logoped") return { ok: false, razlog: "prijavljen" };
    console.error("pristup: ponovno slanje", String(e));
    return { ok: false, razlog: "greska" };
  }
}

/**
 * „Mail nije stigao”: upiše vrijeme i (dobrovoljan) kontakt, superadmin dobije obavijest (jednu po zahtjevu).
 * Ponovni klik samo osvježi kontakt. false: nema praćenja.
 */
export async function trebaPomoc(
  token: string | null, kontakt: string, sada = new Date(), dohvat: typeof fetch = fetch,
): Promise<boolean> {
  const p = await procitajPracenje(token, sada);
  if (!p) return false;
  const k = kontakt.trim().slice(0, KONTAKT_MAX) || null;
  await env.DB.prepare("UPDATE zahtjevi_pristupa SET pomoc_at = COALESCE(pomoc_at, ?), pomoc_kontakt = COALESCE(?, pomoc_kontakt) WHERE id = ?")
    .bind(sada.toISOString(), k, p.id).run();
  if (!p.pomocAt) await obavijesti({ vrsta: "pomoc", zahtjevId: p.id }, dohvat, sada);
  return true;
}

/** Za /admin/uprava/korisnici: po e-mailu zadnji zahtjev s praćenjem (slanja, pomoć, kontakt, kupon). */
export interface OnboardingStanje { slanja: number; pomoc_at: string | null; pomoc_kontakt: string | null; kupon: string | null }

export async function stanjaOnboardinga(): Promise<Map<string, OnboardingStanje>> {
  const r = (await env.DB.prepare(
    `SELECT email, slanja, pomoc_at, pomoc_kontakt, kupon FROM zahtjevi_pristupa
     WHERE pracenje_hash IS NOT NULL AND status = 'odobren' ORDER BY id`,
  ).all<OnboardingStanje & { email: string }>()).results;
  return new Map(r.map(({ email, ...o }) => [email.toLowerCase(), o]));
}
