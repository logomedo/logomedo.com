// Slanje e-pošte kroz Resend (domena logomedo.com, regija eu-west-1; DNS samo na poddomenama send/rsend i
// resend._domainkey, MX i SPF apexa ostaju Googleovi). Ključ je secret RESEND_API_KEY samo u produkciji:
// staging je kopija produkcijske D1 sa stvarnim adresama, pa bez ključa ne šalje ništa i admin dobije link kao prije.
import { env } from "cloudflare:workers";
import { pozivnica } from "./emails/generirano";

export const POSILJATELJ = "LogoMedo <pozivnica@logomedo.com>";
export const ODGOVOR_NA = "bok@logomedo.com";

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

/** Pošalji pozivnicu. Ne baca: neuspjeh vraća razlog, a admin i dalje ima link za ručno slanje. */
export async function posaljiPozivnicu(p: Pozivnica, f: typeof fetch = fetch): Promise<IshodSlanja> {
  const kljuc = env.RESEND_API_KEY;
  if (!kljuc) return { ok: false, razlog: "nema_kljuca" };
  const { subject, text, html } = sadrzajPozivnice(p);
  try {
    const r = await f("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${kljuc}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: POSILJATELJ, to: [p.email], reply_to: ODGOVOR_NA, subject, text, html }),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!r.ok || !j.id) return { ok: false, razlog: "greska", detalj: `${r.status} ${j.message ?? ""}`.trim() };
    return { ok: true, id: j.id };
  } catch (e) {
    return { ok: false, razlog: "greska", detalj: String(e) };
  }
}
