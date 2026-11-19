// Slanje e-pošte kroz Resend (domena logomedo.com, regija eu-west-1; DNS samo na poddomenama send/rsend i
// resend._domainkey, MX i SPF apexa ostaju Googleovi). Ključ je secret RESEND_API_KEY samo u produkciji:
// staging je kopija produkcijske D1 sa stvarnim adresama, pa bez ključa ne šalje ništa i admin dobije link kao prije.
import { env } from "cloudflare:workers";
import { pozivnica } from "./emails/generirano";
import { adresaZaOdgovor, noviRazgovor, obrisiPrazanRazgovor, spremiOdlaznu } from "./poruke";

export const POSILJATELJ = "LogoMedo <pozivnica@logomedo.com>";
/** Rezervna adresa za odgovor (mailovi bez razgovora); pozivnica šalje na `adresaZaOdgovor(kljuc)` (docs/inbox/). */
export const ODGOVOR_NA = "bok@logomedo.com";
/** U D1 se sprema kopija pozivnice bez tokena: poveznica vrijedi do isteka i ne smije ležati u `poruke`. */
export const SKRIVENA_POVEZNICA = "[poveznica pozivnice nije spremljena]";

export type IshodSlanja = { ok: true; id: string } | { ok: false; razlog: "nema_kljuca" | "greska"; detalj?: string };

export interface Pozivnica { email: string; ime: string; url: string; istjece: string }

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function datum(iso: string): string {
  return new Date(iso).toLocaleString("hr-HR", {
    timeZone: "Europe/Zagreb", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Popuni {{ključ}} u predlošku; u HTML-u su vrijednosti escapane. Nepoznat ključ baca (greška u predlošku). */
export function popuni(predlozak: string, v: Record<string, string>, html: boolean): string {
  return predlozak.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    if (!(k in v)) throw new Error(`predložak: nema vrijednosti za {{${k}}}`);
    return html ? escape(v[k]) : v[k];
  });
}

/** Tekst i HTML pozivnice iz React Email predloška (emails/Pozivnica.tsx, izvoz `npm run emails`). */
export function sadrzajPozivnice(p: Pozivnica): { subject: string; text: string; html: string } {
  const ime = p.ime.trim().split(/\s+/)[0] || "";
  const v = { pozdrav: ime ? `Pozdrav ${ime},` : "Pozdrav,", url: p.url, istjece: datum(p.istjece) };
  return { subject: pozivnica.naslov, text: popuni(pozivnica.text, v, false), html: popuni(pozivnica.html, v, true) };
}

/**
 * Pošalji pozivnicu. Ne baca: neuspjeh vraća razlog, a admin i dalje ima link za ručno slanje.
 * Prije slanja otvara razgovor u inboxu, pa `reply_to` nosi njegov ključ i odgovor logopeda stiže u
 * /admin/poruke; poslana pozivnica (bez tokena) se upisuje u taj razgovor. Neuspjelo slanje briše prazan razgovor.
 */
export async function posaljiPozivnicu(p: Pozivnica, f: typeof fetch = fetch): Promise<IshodSlanja> {
  const kljuc = env.RESEND_API_KEY;
  if (!kljuc) return { ok: false, razlog: "nema_kljuca" };
  const { subject, text, html } = sadrzajPozivnice(p);
  let razgovor: { id: number; kljuc: string } | null = null;
  try {
    razgovor = await noviRazgovor({ email: p.email, ime: p.ime.trim() || null, predmet: subject });
  } catch (e) {
    console.error("pozivnica: razgovor nije otvoren, odgovor ide na rezervnu adresu", String(e));
  }
  const replyTo = razgovor ? adresaZaOdgovor(razgovor.kljuc) : ODGOVOR_NA;
  let ishod: IshodSlanja;
  try {
    const r = await f("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${kljuc}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: POSILJATELJ, to: [p.email], reply_to: replyTo, subject, text, html }),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
    ishod = !r.ok || !j.id ? { ok: false, razlog: "greska", detalj: `${r.status} ${j.message ?? ""}`.trim() } : { ok: true, id: j.id };
  } catch (e) {
    ishod = { ok: false, razlog: "greska", detalj: String(e) };
  }
  if (!razgovor) return ishod;
  try {
    if (!ishod.ok) await obrisiPrazanRazgovor(razgovor.id);
    else {
      const kopija = sadrzajPozivnice({ ...p, url: SKRIVENA_POVEZNICA });
      await spremiOdlaznu({
        razgovorId: razgovor.id, resendId: ishod.id, od: POSILJATELJ, za: [p.email], predmet: subject,
        text: kopija.text, html: kopija.html, poslao: null,
      });
    }
  } catch (e) {
    console.error("pozivnica: upis u razgovor nije uspio", String(e));
  }
  return ishod;
}
