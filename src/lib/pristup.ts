// Obrazac „Zatraži pristup” (/pristup, S7 landinga): logoped s landinga pošalje zahtjev, superadmin ga
// odobri na /admin/zahtjevi (src/lib/admin/zahtjevi.ts). Ovdje je javni dio: čitanje i provjera unosa,
// zaštita od spama bez vanjske skripte (honeypot, vremenski žig, limit po IP-u, jedan otvoreni zahtjev po
// e-mailu) i retencija. Odgovori koji bi otkrili nešto o bazi (postoji li već zahtjev) ili pomogli botu
// (honeypot, prebrz obrazac) su isti „hvala” kao uspjeh, bez upisa.
import { env } from "cloudflare:workers";
import { ispravanEmail, normalizirajEmail } from "./admin/pozivi";
import { sha256Hex } from "./admin/sesija";
import { IP_SATI, ROK_MJESECI } from "./pristup-rokovi";

export { IP_SATI, ROK_MJESECI };
/** Najviše spremljenih zahtjeva s iste IP adrese u zadnjih sat vremena. */
export const LIMIT_PO_SATU = 3;
/** Obrazac poslan brže od ovoga je bot (tiho „hvala”, bez upisa). */
export const MIN_SEKUNDI = 3;
/** Obrazac stariji od ovoga treba ponovno poslati (400 s porukom i unesenim vrijednostima). */
export const MAX_SATI = 24;
export const MAX = { ime: 80, ustanova: 120, grad: 120, poruka: 1000 } as const;
/** Honeypot: skriveno polje koje čovjek ne vidi ni ne popunjava. */
export const HONEYPOT = "web_stranica";
export const ZIG = "otvoreno";

export type Polje = "ime" | "email" | "ustanova" | "grad" | "poruka" | "privola";
export interface Unos { ime: string; email: string; ustanova: string; grad: string; poruka: string; privola: boolean }
export type Greske = Partial<Record<Polje | "obrazac", string>>;

export const prazanUnos = (): Unos => ({ ime: "", email: "", ustanova: "", grad: "", poruka: "", privola: false });

// Kontrolni znakovi van (poruka smije imati novi red i tab).
const cisto = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "");
const cistaPoruka = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim() : "";

export function procitajUnos(f: FormData): Unos {
  return {
    ime: cisto(f.get("ime")),
    email: cisto(f.get("email")),
    ustanova: cisto(f.get("ustanova")),
    grad: cisto(f.get("grad")),
    poruka: cistaPoruka(f.get("poruka")),
    privola: f.get("privola") === "da",
  };
}

/** Prazno = sve u redu. Ime, e-mail, ustanova, grad i privola su obavezni; poruka nije. */
export function provjeriUnos(u: Unos): Greske {
  const g: Greske = {};
  if (!u.ime) g.ime = "Upišite ime i prezime.";
  else if (u.ime.length > MAX.ime) g.ime = `Najviše ${MAX.ime} znakova.`;
  if (!u.email) g.email = "Upišite e-mail.";
  else if (!ispravanEmail(normalizirajEmail(u.email))) g.email = "E-mail nije ispravan. Primjer: ime@vrtic.hr";
  if (!u.ustanova) g.ustanova = "Upišite ustanovu ili „privatna praksa”.";
  else if (u.ustanova.length > MAX.ustanova) g.ustanova = `Najviše ${MAX.ustanova} znakova.`;
  if (!u.grad) g.grad = "Upišite grad.";
  else if (u.grad.length > MAX.grad) g.grad = `Najviše ${MAX.grad} znakova.`;
  if (u.poruka.length > MAX.poruka) g.poruka = `Najviše ${MAX.poruka} znakova.`;
  if (!u.privola) g.privola = "Bez ove potvrde ne možemo spremiti zahtjev.";
  return g;
}

// --- Vremenski žig: kad je obrazac otvoren. Uz secret PRISTUP_TAJNA potpisan (HMAC-SHA256), inače goli ms.
const tajna = () => (env.PRISTUP_TAJNA ?? "").trim();
const b64url = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function potpis(poruka: string, kljuc: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(kljuc), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`pristup-zig|${poruka}`)));
}

export async function vremenskiZig(sada = Date.now()): Promise<string> {
  const ms = String(Math.floor(sada));
  const k = tajna();
  return k ? `${ms}.${await potpis(ms, k)}` : ms;
}

export type StanjeZiga = "valja" | "prebrzo" | "isteklo" | "nevaljao";

export async function provjeriZig(zig: unknown, sada = Date.now()): Promise<StanjeZiga> {
  if (typeof zig !== "string") return "nevaljao";
  const k = tajna();
  const m = (k ? /^(\d{13})\.([A-Za-z0-9_-]{43})$/ : /^(\d{13})$/).exec(zig);
  if (!m) return "nevaljao";
  if (k) {
    // Usporedba bez ranog izlaza (dužina je fiksna regexom).
    const ocekivano = await potpis(m[1], k);
    let razlika = 0;
    for (let i = 0; i < ocekivano.length; i++) razlika |= ocekivano.charCodeAt(i) ^ m[2].charCodeAt(i);
    if (razlika !== 0) return "nevaljao";
  }
  const proteklo = sada - Number(m[1]);
  if (proteklo < 0) return "nevaljao";
  if (proteklo < MIN_SEKUNDI * 1000) return "prebrzo";
  if (proteklo > MAX_SATI * 3600_000) return "isteklo";
  return "valja";
}

/** sha-256 IP adrese sa stalnim prefiksom (i secretom ako postoji); sirovi IP se nigdje ne sprema. */
export async function ipHash(ip: string | null): Promise<string | null> {
  const a = (ip ?? "").trim();
  return a ? sha256Hex(`logomedo-pristup-v1|${tajna()}|${a}`) : null;
}

/** POST na /pristup mora doći s istog origina (middleware CSRF vrijedi samo za /admin). */
export const istiOrigin = (request: Request, origin: string) => request.headers.get("origin") === origin;

const prije = (sada: Date, mjeseci: number) => {
  const d = new Date(sada);
  d.setUTCMonth(d.getUTCMonth() - mjeseci);
  return d.toISOString();
};

/** Retencija (odluka u 0038): naredbe za batch pri upisu i pri učitavanju /admin/zahtjevi. */
export function naredbeCiscenja(sada = new Date()): D1PreparedStatement[] {
  const granica = prije(sada, ROK_MJESECI);
  const ipGranica = new Date(sada.getTime() - IP_SATI * 3600_000).toISOString();
  const db = env.DB;
  return [
    db.prepare("DELETE FROM zahtjevi_pristupa WHERE status IN ('novi', 'odbijen') AND created_at < ?").bind(granica),
    db.prepare(
      `DELETE FROM zahtjevi_pristupa WHERE status = 'odobren' AND (obradjen_at < ?
         OR poziv_token_hash IN (SELECT token_hash FROM pozivi WHERE iskoristena_at IS NOT NULL))`,
    ).bind(granica),
    db.prepare("UPDATE zahtjevi_pristupa SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < ?").bind(ipGranica),
  ];
}

export const pocisti = async (sada = new Date()) => { await env.DB.batch(naredbeCiscenja(sada)); };

export type Ishod =
  | { vrsta: "hvala" }
  /** `zig`: vremenski žig za ponovni prikaz obrasca (stari ako je bio dobar, da ispravak ne bude „prebrz”). */
  | { vrsta: "greske"; greske: Greske; unos: Unos; zig: string }
  | { vrsta: "previse" };

/**
 * Obradi poslani obrazac (Origin je već provjeren). Redoslijed: honeypot (tiho), provjera polja (400), žig
 * (prebrz ili nevaljao tiho; istekao 400 s porukom), limit po IP-u (429), pa upis koji ništa ne radi ako za
 * isti e-mail već postoji otvoreni zahtjev. Polja prije žiga: prazan ili nepotpun obrazac uvijek dobije 400.
 */
export async function posalji(f: FormData, ip: string | null, sada = new Date()): Promise<Ishod> {
  const hp = f.get(HONEYPOT);
  if (typeof hp === "string" && hp.trim() !== "") return { vrsta: "hvala" };
  const unos = procitajUnos(f);
  const greske = provjeriUnos(unos);
  const ms = sada.getTime();
  const zig = await provjeriZig(f.get(ZIG), ms);
  // Ispravak nakon greške ne smije ispasti „prebrz”: dobar žig ostaje, istekli se zamijeni već „odstajalim”.
  const ponovniZig = async () =>
    zig === "valja" || zig === "prebrzo" ? String(f.get(ZIG)) : vremenskiZig(zig === "isteklo" ? ms - MIN_SEKUNDI * 1000 : ms);
  if (Object.keys(greske).length) return { vrsta: "greske", greske, unos, zig: await ponovniZig() };
  if (zig === "prebrzo" || zig === "nevaljao") return { vrsta: "hvala" };
  if (zig === "isteklo") {
    const obrazac = "Obrazac je bio otvoren predugo. Provjerite podatke i pošaljite ga ponovno.";
    return { vrsta: "greske", greske: { obrazac }, unos, zig: await ponovniZig() };
  }

  const hash = await ipHash(ip);
  const at = sada.toISOString();
  if (hash) {
    const od = new Date(sada.getTime() - 3600_000).toISOString();
    const n = await env.DB.prepare("SELECT count(*) AS n FROM zahtjevi_pristupa WHERE ip_hash = ? AND created_at > ?")
      .bind(hash, od).first<number>("n");
    if ((n ?? 0) >= LIMIT_PO_SATU) return { vrsta: "previse" };
  }

  const email = normalizirajEmail(unos.email);
  await env.DB.batch([
    ...naredbeCiscenja(sada),
    env.DB.prepare(
      `INSERT INTO zahtjevi_pristupa (ime, email, ustanova, grad, poruka, privola_at, created_at, ip_hash)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM zahtjevi_pristupa WHERE email = ? AND status = 'novi')`,
    ).bind(unos.ime, email, unos.ustanova, unos.grad, unos.poruka || null, at, at, hash, email),
  ]);
  return { vrsta: "hvala" };
}
