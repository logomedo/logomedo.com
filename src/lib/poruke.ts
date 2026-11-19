// Inbox (docs/inbox/): razgovori i poruke u D1 (migracija 0039). Dolazne stižu kroz Resend webhook
// (src/lib/poruke-webhook.ts), odlazne upisuje slanje iz aplikacije (S2: pozivnica, S3: odgovor iz admina).
//
// Nit se traži redom iz odluke 4: ključ u adresi `odgovor+<kljuc>@poruke.logomedo.com`, pa Message-ID iz
// In-Reply-To/References, pa e-mail pošiljatelja; inače novi razgovor 'nerasporedjen'. Ništa se ne baca.
// Sadržaj poruka je osobni podatak: ova datoteka ne logira ništa i ne piše u `aktivnost`.
import { env } from "cloudflare:workers";

export const DOMENA_PORUKA = "poruke.logomedo.com";
const PREFIKS = "odgovor+";

const db = () => env.DB as D1Database;

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** Nasumičan ključ razgovora: 16 bajtova (128 bita) u base32 malim slovima, 26 znakova, bez PII. */
export function kljucRazgovora(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let bitovi = 0, vrijednost = 0, out = "";
  for (const x of b) {
    vrijednost = (vrijednost << 8) | x;
    bitovi += 8;
    while (bitovi >= 5) {
      out += BASE32[(vrijednost >>> (bitovi - 5)) & 31];
      bitovi -= 5;
    }
  }
  if (bitovi > 0) out += BASE32[(vrijednost << (5 - bitovi)) & 31];
  return out;
}

/** Adresa za odgovor (Reply-To) za razgovor. */
export function adresaZaOdgovor(kljuc: string): string {
  return `${PREFIKS}${kljuc}@${DOMENA_PORUKA}`;
}

/** `Ime Prezime <a@b.hr>` ili `a@b.hr` → normaliziran e-mail i ime (ako ga ima). */
export function razdvojiAdresu(s: string): { email: string; ime: string | null } {
  const t = s.trim();
  const m = t.match(/^(.*?)\s*<([^<>]+)>\s*$/);
  if (!m) return { email: t.toLowerCase(), ime: null };
  const ime = m[1].trim().replace(/^"(.*)"$/, "$1").trim();
  return { email: m[2].trim().toLowerCase(), ime: ime || null };
}

/** Ključ iz adrese `odgovor+<kljuc>@poruke.logomedo.com` (velika slova se ne razlikuju), inače null. */
export function kljucIzAdrese(adresa: string): string | null {
  const { email } = razdvojiAdresu(adresa);
  const at = email.lastIndexOf("@");
  if (at < 0 || email.slice(at + 1) !== DOMENA_PORUKA) return null;
  const lokalni = email.slice(0, at);
  if (!lokalni.startsWith(PREFIKS)) return null;
  const k = lokalni.slice(PREFIKS.length);
  return /^[a-z2-7]{16,64}$/.test(k) ? k : null;
}

/** Message-ID-jevi iz zaglavlja In-Reply-To/References (`<a@b> <c@d>`), redom, bez duplikata. */
export function messageIdovi(...zaglavlja: (string | null | undefined)[]): string[] {
  const ids = zaglavlja.flatMap((z) => (z ?? "").match(/<[^<>\s]+>/g) ?? []);
  return [...new Set(ids)];
}

export interface PronadjenRazgovor { id: number; nacin: "adresa" | "reference" | "posiljatelj" }

/** Nađi razgovor za dolaznu poruku (odluka 4). `za`: To, Cc i received_for; `od`: adresa pošiljatelja. */
export async function nadjiRazgovor(p: { za: string[]; reference: string[]; od: string }): Promise<PronadjenRazgovor | null> {
  for (const adresa of p.za) {
    const k = kljucIzAdrese(adresa);
    if (!k) continue;
    const r = await db().prepare("SELECT id FROM razgovori WHERE kljuc = ?").bind(k).first<{ id: number }>();
    if (r) return { id: r.id, nacin: "adresa" };
  }
  const ids = p.reference.slice(-50);
  if (ids.length) {
    const r = await db()
      .prepare(`SELECT razgovor_id FROM poruke WHERE message_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at DESC LIMIT 1`)
      .bind(...ids)
      .first<{ razgovor_id: number }>();
    if (r) return { id: r.razgovor_id, nacin: "reference" };
  }
  const { email } = razdvojiAdresu(p.od);
  if (email) {
    const r = await db().prepare("SELECT id FROM razgovori WHERE email = ? ORDER BY zadnja_at DESC LIMIT 1").bind(email).first<{ id: number }>();
    if (r) return { id: r.id, nacin: "posiljatelj" };
  }
  return null;
}

const SQL_NOVI_RAZGOVOR =
  `INSERT INTO razgovori (kljuc, email, ime, korisnik_id, predmet, zadnja_at, status, created_at)
   VALUES (?1, ?2, ?3, (SELECT id FROM korisnici WHERE email = ?2), ?4, ?5, ?6, ?5)`;

/** Novi razgovor (npr. prije slanja pozivnice, da `reply_to` nosi ključ). Vraća id i ključ. */
export async function noviRazgovor(p: { email: string; ime?: string | null; predmet?: string | null; sada?: string }): Promise<{ id: number; kljuc: string }> {
  const kljuc = kljucRazgovora();
  const sada = p.sada ?? new Date().toISOString();
  const r = await db()
    .prepare(`${SQL_NOVI_RAZGOVOR} RETURNING id`)
    .bind(kljuc, razdvojiAdresu(p.email).email, p.ime ?? null, p.predmet ?? null, sada, "otvoren")
    .first<{ id: number }>();
  return { id: r!.id, kljuc };
}

export interface PrivitakZapis { r2Kljuc: string | null; ime: string; tip: string; velicina: number | null; contentId?: string | null; napomena?: string | null }

export interface Dolazna {
  resendId: string;
  messageId: string | null;
  inReplyTo: string | null;
  /** Svi Message-ID-jevi iz In-Reply-To i References. */
  reference: string[];
  /** Pošiljatelj, `Ime <adresa>` ili gola adresa. */
  od: string;
  /** Primatelji (To, Cc, received_for); u njima se traži ključ razgovora. */
  za: string[];
  predmet: string | null;
  text: string | null;
  html: string | null;
  tijeloFali: boolean;
  napomena?: string | null;
  privitci: PrivitakZapis[];
  createdAt: string;
}

export type IshodDolazne = { nova: false } | { nova: true; porukaId: number; razgovorId: number; nacin: PronadjenRazgovor["nacin"] | "novi" };

const jeDuplikat = (e: unknown) => /UNIQUE constraint failed: poruke\.resend_id/.test(String((e as Error)?.message ?? e));

/**
 * Spremi dolaznu poruku. Idempotentno po `resendId` (Resend `email_id`): drugi put vraća `{ nova: false }`.
 * Razgovor (kad je nov), poruka, privitci i brojač nepročitanih idu u jednoj transakciji (batch).
 */
export async function spremiDolaznu(d: Dolazna): Promise<IshodDolazne> {
  if (await db().prepare("SELECT 1 FROM poruke WHERE resend_id = ?").bind(d.resendId).first()) return { nova: false };
  const nadjen = await nadjiRazgovor({ za: d.za, reference: d.reference, od: d.od });
  const posiljatelj = razdvojiAdresu(d.od);
  const upiti: D1PreparedStatement[] = [];
  let razgovor: { sql: string; vrijednost: number | string };
  if (nadjen) {
    razgovor = { sql: "?", vrijednost: nadjen.id };
  } else {
    const kljuc = kljucRazgovora();
    upiti.push(db().prepare(SQL_NOVI_RAZGOVOR).bind(kljuc, posiljatelj.email, posiljatelj.ime, d.predmet, d.createdAt, "nerasporedjen"));
    razgovor = { sql: "(SELECT id FROM razgovori WHERE kljuc = ?)", vrijednost: kljuc };
  }
  upiti.push(
    db()
      .prepare(
        `INSERT INTO poruke (razgovor_id, smjer, resend_id, message_id, in_reply_to, reference, od, za, predmet, text, html, tijelo_fali, napomena, created_at)
         VALUES (${razgovor.sql}, 'ulaz', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        razgovor.vrijednost, d.resendId, d.messageId, d.inReplyTo, d.reference.join(" ") || null, d.od.trim(), d.za.join(", "),
        d.predmet, d.text, d.html, d.tijeloFali ? 1 : 0, d.napomena ?? null, d.createdAt,
      ),
  );
  for (const p of d.privitci) {
    upiti.push(
      db()
        .prepare(
          `INSERT INTO privitci (poruka_id, r2_kljuc, ime, tip, velicina, content_id, napomena)
           SELECT id, ?, ?, ?, ?, ?, ? FROM poruke WHERE resend_id = ?`,
        )
        .bind(p.r2Kljuc, p.ime, p.tip, p.velicina, p.contentId ?? null, p.napomena ?? null, d.resendId),
    );
  }
  // Zatvoren razgovor se novom porukom opet otvara; 'nerasporedjen' ostaje dok ga superadmin ne razvrsta.
  upiti.push(
    db()
      .prepare(
        `UPDATE razgovori SET
           neprocitano = (SELECT COUNT(*) FROM poruke WHERE razgovor_id = razgovori.id AND smjer = 'ulaz' AND procitano_at IS NULL),
           zadnja_at = MAX(zadnja_at, ?),
           status = CASE status WHEN 'zatvoren' THEN 'otvoren' ELSE status END
         WHERE id = ${razgovor.sql}
         RETURNING id`,
      )
      .bind(d.createdAt, razgovor.vrijednost),
  );
  let rez: D1Result[];
  try {
    rez = await db().batch(upiti);
  } catch (e) {
    if (jeDuplikat(e)) return { nova: false };
    throw e;
  }
  const razgovorId = (rez.at(-1)!.results[0] as { id: number }).id;
  const p = await db().prepare("SELECT id FROM poruke WHERE resend_id = ?").bind(d.resendId).first<{ id: number }>();
  return { nova: true, porukaId: p!.id, razgovorId, nacin: nadjen?.nacin ?? "novi" };
}

export interface Odlazna {
  razgovorId: number;
  resendId: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  reference?: string[];
  od: string;
  za: string[];
  predmet: string | null;
  text: string | null;
  html: string | null;
  /** E-mail superadmina; null za automatske mailove (pozivnica). */
  poslao: string | null;
  createdAt?: string;
}

/** Upiši poslanu poruku u razgovor. Vraća id poruke. */
export async function spremiOdlaznu(o: Odlazna): Promise<number> {
  const sada = o.createdAt ?? new Date().toISOString();
  const [r] = await db().batch([
    db()
      .prepare(
        `INSERT INTO poruke (razgovor_id, smjer, resend_id, message_id, in_reply_to, reference, od, za, predmet, text, html, created_at, procitano_at, poslao)
         VALUES (?, 'izlaz', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .bind(
        o.razgovorId, o.resendId, o.messageId ?? null, o.inReplyTo ?? null, o.reference?.join(" ") || null, o.od, o.za.join(", "),
        o.predmet, o.text, o.html, sada, sada, o.poslao,
      ),
    db().prepare("UPDATE razgovori SET zadnja_at = MAX(zadnja_at, ?) WHERE id = ?").bind(sada, o.razgovorId),
  ]);
  return (r.results[0] as { id: number }).id;
}

/** Označi sve dolazne poruke razgovora pročitanima. */
export async function oznaciProcitano(razgovorId: number, sada: string = new Date().toISOString()): Promise<void> {
  await db().batch([
    db().prepare("UPDATE poruke SET procitano_at = ? WHERE razgovor_id = ? AND smjer = 'ulaz' AND procitano_at IS NULL").bind(sada, razgovorId),
    db().prepare("UPDATE razgovori SET neprocitano = 0 WHERE id = ?").bind(razgovorId),
  ]);
}

/** Ukupan broj nepročitanih dolaznih poruka (brojač u bočnoj traci superadmina). */
export async function brojNeprocitanih(): Promise<number> {
  const r = await db().prepare("SELECT COALESCE(SUM(neprocitano), 0) AS n FROM razgovori WHERE neprocitano > 0").first<{ n: number }>();
  return r?.n ?? 0;
}
