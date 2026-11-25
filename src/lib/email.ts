// Slanje e-pošte kroz Resend (domena logomedo.com, regija eu-west-1; DNS samo na poddomenama send/rsend i
// resend._domainkey, MX i SPF apexa ostaju Googleovi). Ključ je secret RESEND_API_KEY samo u produkciji:
// staging je kopija produkcijske D1 sa stvarnim adresama, pa bez ključa ne šalje ništa i admin dobije link kao prije.
import { env } from "cloudflare:workers";
import { odgovor, pozivnica } from "./emails/generirano";
import {
  adresaZaOdgovor, bezCitata, messageIdovi, noviRazgovor, obrisiPrazanRazgovor, porukaPoResendId, postaviMessageId, razdvojiAdresu,
  razgovorPoruke, spremiOdlaznu, zaOdgovor,
} from "./poruke";
import { ispravanEmail, normalizirajEmail } from "./admin/pozivi";

export const POSILJATELJ = "LogoMedo <pozivnica@logomedo.com>";
/** Pošiljatelj odgovora iz /admin/uprava/poruke; odgovor na njega ide na `reply_to` razgovora, ne na ovu adresu. */
export const POSILJATELJ_ODGOVORA = "LogoMedo <bok@logomedo.com>";
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

/**
 * Popuni {{ključ}} u predlošku; u HTML-u su vrijednosti escapane. {{{ključ}}} je već gotov HTML (sastavlja ga
 * ova datoteka iz escapanog teksta) i umeće se kakav jest. Nepoznat ključ baca (greška u predlošku).
 */
export function popuni(predlozak: string, v: Record<string, string>, html: boolean): string {
  return predlozak.replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (_, sirovo: string | undefined, k: string | undefined) => {
    const kljuc = (sirovo ?? k)!;
    if (!(kljuc in v)) throw new Error(`predložak: nema vrijednosti za {{${kljuc}}}`);
    return html && !sirovo ? escape(v[kljuc]) : v[kljuc];
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
 * /admin/uprava/poruke; poslana pozivnica (bez tokena) se upisuje u taj razgovor. Neuspjelo slanje briše prazan razgovor.
 */
export async function posaljiPozivnicu(p: Pozivnica, f: typeof fetch = fetch, cekaj = 1500): Promise<IshodSlanja> {
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
      const porukaId = await spremiOdlaznu({
        razgovorId: razgovor.id, resendId: ishod.id, od: POSILJATELJ, za: [p.email], predmet: subject,
        text: kopija.text, html: kopija.html, poslao: null,
      });
      const mid = await dohvatiMessageId(ishod.id, kljuc, f, cekaj);
      if (mid) await postaviMessageId(porukaId, mid);
    }
  } catch (e) {
    console.error("pozivnica: upis u razgovor nije uspio", String(e));
  }
  return ishod;
}

/**
 * Message-ID poslanog maila (`<…@eu-west-1.amazonses.com>`): Resend ga ne vraća iz `POST /emails`, ali ga vraća
 * `GET /emails/{id}` (odluka 206). Odgovor logopeda ga nosi u `In-Reply-To`, a naš idući odgovor u `References`.
 * Ne baca; `null` ako ga (još) nema. Jedan ponovljeni pokušaj nakon kratke stanke (`cekaj` u testovima 0).
 */
export async function dohvatiMessageId(id: string, kljuc: string, f: typeof fetch = fetch, cekaj = 1500): Promise<string | null> {
  for (let i = 0; i < 2; i++) {
    if (i) await new Promise((r) => setTimeout(r, cekaj));
    try {
      const r = await f(`https://api.resend.com/emails/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${kljuc}` } });
      if (!r.ok) continue;
      const j = (await r.json().catch(() => ({}))) as { message_id?: string | null };
      const mid = messageIdovi(j.message_id)[0];
      if (mid) return mid;
    } catch { /* mreža: pokušaj opet */ }
  }
  return null;
}

/** Tekst u HTML odlomke: escapano, prazan red dijeli odlomke, prijelom reda je <br>. */
export function tekstUHtml(t: string): string {
  return t.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/)
    .map((o) => `<p style="font-size:16px;line-height:24px;margin:0 0 16px">${escape(o).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** „Re: predmet” bez gomilanja (Re:, RE:, Odg:, AW:, Fwd ostaje). */
export function predmetOdgovora(predmet: string | null): string {
  const p = (predmet ?? "").trim().replace(/^((re|odg|aw|sv)\s*:\s*)+/i, "").trim();
  return p ? `Re: ${p}` : "Re: LogoMedo";
}

const CITAT_LINIJA = 12;
const CITAT_ZNAKOVA = 700;

/** Kratki citat zadnje dolazne poruke: bez njezinih citata, do 12 redaka i 700 znakova. */
export function kratkiCitat(text: string | null): string {
  const t = bezCitata(text);
  let linije = t.split("\n");
  let skraceno = linije.length > CITAT_LINIJA;
  linije = linije.slice(0, CITAT_LINIJA);
  let out = linije.join("\n");
  if (out.length > CITAT_ZNAKOVA) { out = out.slice(0, CITAT_ZNAKOVA).trimEnd(); skraceno = true; }
  return skraceno ? `${out}…` : out;
}

function datumKratko(iso: string): string {
  return new Date(iso).toLocaleString("hr-HR", { timeZone: "Europe/Zagreb", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export interface Odgovor {
  razgovorId: number; tekst: string; /** E-mail superadmina. */ poslao: string;
  /** Jednokratni ključ obrasca: isti ključ = isto slanje (dvoklik, ponovljeni POST). Ide u Resend `Idempotency-Key`. */
  kljucSlanja?: string;
  /** Prvi mail novog razgovora (S4): predmet bez „Re:”, ključ idempotencije ne ovisi o id-ju razgovora. */
  prvi?: boolean;
}

export type IshodOdgovora = IshodSlanja | { ok: false; razlog: "nema_razgovora" | "prazno" | "u_tijeku" };

/** Ključ obrasca odgovora: nasumičan, samo sigurni znakovi (Resend dopušta do 256). */
export const KLJUC_SLANJA = /^[A-Za-z0-9-]{16,64}$/;

/** Sadržaj odgovora iz predloška (emails/Odgovor.tsx). Čisto, bez D1 i mreže (testovi, pregled). */
export function sadrzajOdgovora(p: { tekst: string; predmet: string | null; citat?: { od: string; kada: string; text: string | null } | null; prvi?: boolean }): { subject: string; text: string; html: string } {
  const tekst = p.tekst.replace(/\r\n?/g, "\n").trim();
  const subject = p.prvi ? (p.predmet ?? "").trim() || "LogoMedo" : predmetOdgovora(p.predmet);
  const c = p.citat ? kratkiCitat(p.citat.text) : "";
  let citatText = "", citatHtml = "";
  if (p.citat && c) {
    const { email, ime } = razdvojiAdresu(p.citat.od);
    const uvod = `${datumKratko(p.citat.kada)}, ${ime ? `${ime} <${email}>` : email}:`;
    citatText = `${uvod}\n${c.split("\n").map((l) => `> ${l}`).join("\n")}`;
    citatHtml = `<p style="font-size:13px;line-height:20px;color:#6b6357;margin:8px 0 4px">${escape(uvod)}</p>` +
      `<blockquote style="margin:0;padding:0 0 0 12px;border-left:3px solid #eee5d8;color:#6b6357;font-size:14px;line-height:21px">${escape(c).replace(/\n/g, "<br>")}</blockquote>`;
  }
  const pregled = tekst.replace(/\s+/g, " ").slice(0, 90);
  const v = { predmet: subject, pregled, tijelo: tekstUHtml(tekst), citat: citatHtml };
  return {
    subject,
    html: popuni(odgovor.html, v, true),
    text: popuni(odgovor.text, { ...v, tijelo: tekst, citat: citatText }, false).replace(/\n{3,}/g, "\n\n"),
  };
}

/**
 * Odgovor superadmina na razgovor (S3). Šalje s `reply_to` razgovora (nit u D1 drži ključ), `In-Reply-To` =
 * Message-ID zadnje dolazne (ili, bez nje, zadnje odlazne s poznatim id-jem) i `References` = njezine reference +
 * taj id, pa nit drži i u logopedovu pretincu. Nakon uspjeha upisuje odlaznu poruku (`poslao`) i dohvaća njezin
 * Message-ID. Bez RESEND_API_KEY (staging) ne šalje i ne upisuje ništa.
 */
export async function posaljiOdgovor(o: Odgovor, f: typeof fetch = fetch, cekaj = 1500): Promise<IshodOdgovora> {
  const kljuc = env.RESEND_API_KEY;
  if (!kljuc) return { ok: false, razlog: "nema_kljuca" };
  const tekst = o.tekst.replace(/\r\n?/g, "\n").trim();
  if (!tekst) return { ok: false, razlog: "prazno" };
  const z = await zaOdgovor(o.razgovorId);
  if (!z) return { ok: false, razlog: "nema_razgovora" };
  const izvor = z.dolazna?.message_id ? z.dolazna : z.odlazna;
  const inReplyTo = izvor?.message_id ?? null;
  const reference = inReplyTo ? messageIdovi(izvor!.reference, inReplyTo).slice(-20) : [];
  const { subject, text, html } = sadrzajOdgovora({
    tekst,
    predmet: z.dolazna?.predmet ?? z.razgovor.predmet ?? z.odlazna?.predmet ?? null,
    citat: z.dolazna ? { od: z.dolazna.od, kada: z.dolazna.created_at, text: z.dolazna.text } : null,
    prvi: o.prvi,
  });
  const headers: Record<string, string> = {};
  if (inReplyTo) { headers["In-Reply-To"] = inReplyTo; headers.References = reference.join(" "); }
  const za = z.razgovor.ime ? `${z.razgovor.ime.replace(/["<>\r\n]/g, "")} <${z.razgovor.email}>` : z.razgovor.email;
  const zaglavlja: Record<string, string> = { Authorization: `Bearer ${kljuc}`, "Content-Type": "application/json" };
  // Isti ključ unutar 24 h: Resend ne šalje ponovno nego vrati isti id (odluka 312).
  if (o.kljucSlanja && KLJUC_SLANJA.test(o.kljucSlanja)) zaglavlja["Idempotency-Key"] = o.prvi ? `novi-${o.kljucSlanja}` : `odgovor-${z.razgovor.id}-${o.kljucSlanja}`;
  let ishod: IshodSlanja;
  try {
    const r = await f("https://api.resend.com/emails", {
      method: "POST",
      headers: zaglavlja,
      body: JSON.stringify({
        from: POSILJATELJ_ODGOVORA, to: [za], reply_to: adresaZaOdgovor(z.razgovor.kljuc), subject, text, html,
        ...(inReplyTo ? { headers } : {}),
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    // 409 concurrent_idempotent_requests: isti ključ se upravo šalje (drugi klik/kartica); taj zahtjev upiše poruku.
    if (r.status === 409 && j.name === "concurrent_idempotent_requests") return { ok: false, razlog: "u_tijeku" };
    ishod = !r.ok || !j.id ? { ok: false, razlog: "greska", detalj: `${r.status} ${j.message ?? ""}`.trim() } : { ok: true, id: j.id };
  } catch (e) {
    ishod = { ok: false, razlog: "greska", detalj: String(e) };
  }
  if (!ishod.ok) return ishod;
  // Ponovljeni ključ: Resend je vratio id već upisanog odgovora, pa se ništa ne upisuje dvaput.
  if (await porukaPoResendId(ishod.id)) return ishod;
  // Mail je otišao: upis ne smije pasti tiho, ali ni poništiti slanje. Greška upisa ide u log (bez sadržaja).
  try {
    const porukaId = await spremiOdlaznu({
      razgovorId: z.razgovor.id, resendId: ishod.id, od: POSILJATELJ_ODGOVORA, za: [z.razgovor.email], predmet: subject,
      text: tekst, html, inReplyTo, reference, poslao: o.poslao,
    });
    const mid = await dohvatiMessageId(ishod.id, kljuc, f, cekaj);
    if (mid) await postaviMessageId(porukaId, mid);
  } catch (e) {
    console.error("odgovor: poslan, ali upis u razgovor nije uspio", ishod.id, String((e as Error)?.message ?? e));
  }
  return ishod;
}

export interface NoviRazgovor {
  email: string; ime: string; predmet: string; tekst: string; /** E-mail superadmina. */ poslao: string; kljucSlanja?: string;
}
export type IshodNovog =
  | { ok: true; razgovorId: number }
  | { ok: false; razlog: "nema_kljuca" | "greska" | "u_tijeku" | "prazno" | "email" | "predmet"; detalj?: string };

export const PREDMET_MAX = 200;

/**
 * Novi razgovor iz admina (S4, npr. s /admin/uprava/zahtjevi): otvori razgovor, pošalji prvi mail kroz `posaljiOdgovor`
 * (isti predložak, `reply_to` razgovora, bez citata i bez „Re:”) i upiši ga. Neuspjeh briše prazan razgovor.
 * Ponovljeni POST s istim ključem obrasca: Resend vrati id već poslanog maila, pa se vraća onaj razgovor.
 */
export async function posaljiNoviRazgovor(n: NoviRazgovor, f: typeof fetch = fetch, cekaj = 1500): Promise<IshodNovog> {
  if (!env.RESEND_API_KEY) return { ok: false, razlog: "nema_kljuca" };
  const email = normalizirajEmail(n.email);
  if (!ispravanEmail(email)) return { ok: false, razlog: "email" };
  const predmet = n.predmet.replace(/[\r\n]+/g, " ").trim();
  if (!predmet || predmet.length > PREDMET_MAX) return { ok: false, razlog: "predmet" };
  if (!n.tekst.trim()) return { ok: false, razlog: "prazno" };
  const ime = n.ime.replace(/[\r\n"<>]+/g, " ").trim().slice(0, 120) || null;
  const raz = await noviRazgovor({ email, ime, predmet });
  const r = await posaljiOdgovor({ razgovorId: raz.id, tekst: n.tekst, poslao: n.poslao, kljucSlanja: n.kljucSlanja, prvi: true }, f, cekaj);
  if (!r.ok) {
    await obrisiPrazanRazgovor(raz.id);
    return r.razlog === "nema_razgovora" ? { ok: false, razlog: "greska" } : { ok: false, razlog: r.razlog, detalj: "detalj" in r ? r.detalj : undefined };
  }
  const vlasnik = await razgovorPoruke(r.id);
  if (vlasnik && vlasnik !== raz.id) {
    await obrisiPrazanRazgovor(raz.id);
    return { ok: true, razgovorId: vlasnik };
  }
  return { ok: true, razgovorId: raz.id };
}
