// Slanje e-pošte kroz Resend (domena logomedo.com, regija eu-west-1; DNS samo na poddomenama send/rsend i
// resend._domainkey, MX i SPF apexa ostaju Googleovi). Ključ je secret RESEND_API_KEY samo u produkciji:
// staging je kopija produkcijske D1 sa stvarnim adresama, pa bez ključa ne šalje ništa i admin dobije link kao prije.
import { env } from "cloudflare:workers";

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

/** Tekst i HTML pozivnice (izdvojeno radi testa). */
export function sadrzajPozivnice(p: Pozivnica): { subject: string; text: string; html: string } {
  const ime = p.ime.trim().split(/\s+/)[0] || "";
  const pozdrav = ime ? `Pozdrav ${ime},` : "Pozdrav,";
  const do_ = datum(p.istjece);
  const text = [
    pozdrav,
    "",
    "vaš zahtjev za pristup LogoMedu je odobren.",
    "Otvorite link ispod i postavite prijavu (passkey). Link vrijedi do " + do_ + " i može se iskoristiti jednom.",
    "",
    p.url,
    "",
    "Ako vam link istekne ili ne radi, samo odgovorite na ovu poruku.",
    "",
    "LogoMedo",
    "https://logomedo.com",
  ].join("\n");
  const html = `<!doctype html><html lang="hr"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#222;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
<p>${escape(pozdrav)}</p>
<p>vaš zahtjev za pristup LogoMedu je odobren.</p>
<p>Otvorite link ispod i postavite prijavu (passkey). Link vrijedi do <strong>${escape(do_)}</strong> i može se iskoristiti jednom.</p>
<p style="margin:28px 0"><a href="${escape(p.url)}" style="background:#f5b335;color:#1d1a14;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Prihvati pozivnicu</a></p>
<p style="font-size:13px;color:#666">Ako gumb ne radi, kopirajte ovaj link u preglednik:<br><span style="word-break:break-all">${escape(p.url)}</span></p>
<p style="font-size:13px;color:#666">Ako vam link istekne ili ne radi, samo odgovorite na ovu poruku.</p>
<p>LogoMedo<br><a href="https://logomedo.com" style="color:#666">logomedo.com</a></p>
</body></html>`;
  return { subject: "Vaš pristup LogoMedu je odobren", text, html };
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
