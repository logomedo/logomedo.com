// Pogodnosti nakon bete (migrations/0045, docs/pogodnosti.md): superadmin korisniku privatno dodijeli N mjeseci ili
// trajno besplatan pristup. Samo zapis; dok traje beta ništa se ne provodi, a checkout će ga čitati. Po e-mailu
// (malim slovima), pa radi i prije nego račun postoji. Najviše jedna važeća po e-mailu; promjena opoziva staru.
import { env } from "cloudflare:workers";
import { ispravanEmail, normalizirajEmail } from "./pozivi";

export type Pogodnost = { vrsta: "mjeseci"; mjeseci: number } | { vrsta: "trajno"; mjeseci: null };

export interface ZapisPogodnosti {
  id: number; email: string; vrsta: Pogodnost["vrsta"]; mjeseci: number | null; napomena: string | null;
  dodijelio: string; created_at: string; opozvana_at: string | null; opozvao: string | null;
}

export const MJESECI_MAX = 36;
export const NAPOMENA_MAX = 200;

/** „1 mjesec”, „2 mjeseca”, „5 mjeseci”, „21 mjesec”, „12 mjeseci”. */
export function mjeseciTekst(n: number): string {
  const d = n % 10, s = n % 100;
  if (d === 1 && s !== 11) return `${n} mjesec`;
  if (d >= 2 && d <= 4 && (s < 12 || s > 14)) return `${n} mjeseca`;
  return `${n} mjeseci`;
}

export const opisPogodnosti = (p: Pick<Pogodnost, "vrsta" | "mjeseci">) =>
  p.vrsta === "trajno" ? "Trajno besplatno" : `${mjeseciTekst(p.mjeseci!)} besplatno`;

/** Izbori u padajućem izborniku (vrijednost polja `pogodnost`); "" = bez pogodnosti. */
export const IZBORI: { kod: string; tekst: string }[] = [
  { kod: "", tekst: "Bez pogodnosti" },
  ...[1, 2, 3, 6, 12, 24].map((n) => ({ kod: `m${n}`, tekst: opisPogodnosti({ vrsta: "mjeseci", mjeseci: n }) })),
  { kod: "trajno", tekst: opisPogodnosti({ vrsta: "trajno", mjeseci: null }) },
];

/** Vrijednost polja → pogodnost; null = bez; undefined = neispravno. Prima "m<N>" (1…36) i "trajno". */
export function procitajIzbor(v: unknown): Pogodnost | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (v === "trajno") return { vrsta: "trajno", mjeseci: null };
  const m = typeof v === "string" ? /^m(\d{1,2})$/.exec(v) : null;
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= MJESECI_MAX ? { vrsta: "mjeseci", mjeseci: n } : undefined;
}

const procistiNapomenu = (n: unknown) => (typeof n === "string" ? n.trim().slice(0, NAPOMENA_MAX) : "") || null;

/** Naredbe za batch: opozovi važeću za e-mail i (uz `p`) upiši novu. Za `odobri()` u istom tijeku. */
function naredbe(email: string, p: Pogodnost | null, napomena: string | null, tko: string, at: string): D1PreparedStatement[] {
  const db = env.DB;
  const n = [db.prepare("UPDATE pogodnosti SET opozvana_at = ?, opozvao = ? WHERE email = ? AND opozvana_at IS NULL").bind(at, tko, email)];
  if (p) {
    n.push(db.prepare(
      "INSERT INTO pogodnosti (email, vrsta, mjeseci, napomena, dodijelio, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(email, p.vrsta, p.mjeseci, napomena, tko, at));
  }
  return n;
}

export type IshodPogodnosti = { ok: true; email: string } | { ok: false; greska: string };

/** Dodijeli (ili zamijeni) pogodnost; `p = null` uklanja važeću. */
export async function dodijeli(emailUnos: unknown, p: Pogodnost | null, napomena: unknown, tko: string, sada = new Date()): Promise<IshodPogodnosti> {
  const email = typeof emailUnos === "string" ? normalizirajEmail(emailUnos) : "";
  if (!ispravanEmail(email)) return { ok: false, greska: "Neispravan e-mail." };
  await env.DB.batch(naredbe(email, p, procistiNapomenu(napomena), tko, sada.toISOString()));
  return { ok: true, email };
}

/** Važeća pogodnost za e-mail ili null. */
export async function vazeca(email: string): Promise<ZapisPogodnosti | null> {
  return env.DB.prepare("SELECT * FROM pogodnosti WHERE email = ? AND opozvana_at IS NULL")
    .bind(normalizirajEmail(email)).first<ZapisPogodnosti>();
}

export async function vazece(): Promise<ZapisPogodnosti[]> {
  return (await env.DB.prepare("SELECT * FROM pogodnosti WHERE opozvana_at IS NULL ORDER BY created_at DESC, id DESC")
    .all<ZapisPogodnosti>()).results;
}

export async function opozvane(koliko = 20): Promise<ZapisPogodnosti[]> {
  return (await env.DB.prepare("SELECT * FROM pogodnosti WHERE opozvana_at IS NOT NULL ORDER BY opozvana_at DESC, id DESC LIMIT ?")
    .bind(koliko).all<ZapisPogodnosti>()).results;
}
