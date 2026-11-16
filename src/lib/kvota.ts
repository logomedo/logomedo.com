// Tjedna AI kvota (docs/rbac/decisions.md, odluka 10): klizni prozor 7 dana, odvojeno slike (Vertex) i
// izgovori (ElevenLabs). Jedan posao upisan u red = jedan kredit. Logoped ima limit iz `korisnici`,
// superadmin je bez limita, ali mu se potrošnja bilježi.
//
// Obrazac: naredba potrošnje ide kao PRVA naredba u isti `db.batch` kao upis posla. Kad nema mjesta
// (ili korisnik nije aktivan logoped), `kolicina` je NULL, `NOT NULL constraint failed:
// ai_potrosnja.kolicina` poništi cijeli batch (D1 batch je transakcija), pa nema ni posla ni potrošnje.
// `batchSKvotom` tu grešku pretvara u `KvotaPrekoracena`; middleware je pretvara u odgovor.
import { env } from "cloudflare:workers";
import { ulogaZa } from "./admin/sesija";
import type { Uloga } from "./admin/ovlasti";
import { korisnikId as korisnikIdZa } from "./zadaci/baza";

export type VrstaKvote = "slike" | "zvukovi";

const STUPAC_LIMITA: Record<VrstaKvote, string> = { slike: "limit_slike_7d", zvukovi: "limit_zvukovi_7d" };
const IMENICA: Record<VrstaKvote, string> = { slike: "slika", zvukovi: "izgovora" };
const U_PROZORU = "at > datetime('now', '-7 days')";

/** Tko plaća AI posao. Superadmin bez retka u `korisnici` ga dobiva (`korisnikId`, odluka 104). */
export interface Platitelj { email: string; uloga: Uloga; korisnikId: number }

/**
 * Broj poslova: broj, ili skalarni SQL (npr. `SELECT COUNT(*) FROM … WHERE <isti uvjet kao upis>`)
 * kad se broj upisa zna tek u bazi. SQL smije koristiti samo `?` (bez `?1`), jer ide usred naredbe.
 * Izračuna se prije ostalih naredbi batcha, nad istim stanjem nad kojim one odlučuju.
 */
export type Kolicina = number | { sql: string; args: unknown[] };

export class KvotaPrekoracena extends Error {
  readonly vrsta: VrstaKvote;
  /** Koliko je zahtjev tražio; null kad se ne zna (nema prava). */
  readonly trazeno: number | null;
  readonly preostalo: number;
  readonly limit: number;
  readonly oslobadaSe: Date | null;
  /** Tekst za korisnika. */
  readonly poruka: string;
  constructor(o: { vrsta: VrstaKvote; trazeno: number | null; preostalo: number; limit: number; oslobadaSe: Date | null; poruka: string }) {
    super(o.poruka);
    this.name = "KvotaPrekoracena";
    this.vrsta = o.vrsta;
    this.trazeno = o.trazeno;
    this.preostalo = o.preostalo;
    this.limit = o.limit;
    this.oslobadaSe = o.oslobadaSe;
    this.poruka = o.poruka;
  }

  /** Nepoznat ili deaktiviran korisnik: ništa se ne upisuje. */
  static zabrana(vrsta: VrstaKvote): KvotaPrekoracena {
    return new KvotaPrekoracena({
      vrsta, trazeno: null, preostalo: 0, limit: 0, oslobadaSe: null,
      poruka: "Nemaš pravo na AI generiranje (račun nije aktivan).",
    });
  }
}

/** Jedini put od e-maila do platitelja; null = nema pravo na AI (nepoznat, deaktiviran, `admin` izvan ADMIN_EMAILS). */
export async function platitelj(email: string): Promise<Platitelj | null> {
  const u = await ulogaZa(email);
  if (!u) return null;
  const e = email.trim().toLowerCase();
  if (u.korisnikId !== null) return { email: e, uloga: u.uloga, korisnikId: u.korisnikId };
  // Logoped uvijek ima redak; superadmin ga možda još nema.
  return { email: e, uloga: u.uloga, korisnikId: await korisnikIdZa(e) };
}

export interface StanjeKvote { limit: number; potroseno: number; preostalo: number }

/** Stanje obje vrste za korisnika (limit iz retka; za superadmina samo informativno). */
export async function preostalo(korisnikId: number): Promise<Record<VrstaKvote, StanjeKvote>> {
  const r = await env.DB.prepare(
    `SELECT k.limit_slike_7d AS ls, k.limit_zvukovi_7d AS lz,
       (SELECT COALESCE(SUM(kolicina), 0) FROM ai_potrosnja WHERE korisnik_id = k.id AND vrsta = 'slike' AND ${U_PROZORU}) AS ps,
       (SELECT COALESCE(SUM(kolicina), 0) FROM ai_potrosnja WHERE korisnik_id = k.id AND vrsta = 'zvukovi' AND ${U_PROZORU}) AS pz
     FROM korisnici k WHERE k.id = ?`,
  ).bind(korisnikId).first<{ ls: number; lz: number; ps: number; pz: number }>();
  const s = (limit: number, potroseno: number) => ({ limit, potroseno, preostalo: Math.max(0, limit - potroseno) });
  return { slike: s(r?.ls ?? 0, r?.ps ?? 0), zvukovi: s(r?.lz ?? 0, r?.pz ?? 0) };
}

/** Kad najstariji upis u prozoru izlazi iz prozora (tada se vraćaju prvi krediti); null ako nema upisa. */
export async function kadSeOslobada(korisnikId: number, vrsta: VrstaKvote): Promise<Date | null> {
  const r = await env.DB.prepare(
    `SELECT datetime(MIN(at), '+7 days') AS kad FROM ai_potrosnja WHERE korisnik_id = ? AND vrsta = ? AND ${U_PROZORU}`,
  ).bind(korisnikId, vrsta).first<{ kad: string | null }>();
  return r?.kad ? new Date(`${r.kad.replace(" ", "T")}Z`) : null;
}

const DANI = ["nedjelju", "ponedjeljak", "utorak", "srijedu", "četvrtak", "petak", "subotu"];

/** „srijedu 18. 11. u 14:05” po zagrebačkom vremenu. */
export function kadTekst(d: Date): string {
  const dijelovi = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zagreb", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const dan = DANI[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dijelovi.weekday)];
  return `${dan} ${Number(dijelovi.day)}. ${Number(dijelovi.month)}. u ${dijelovi.hour}:${dijelovi.minute}`;
}

export function porukaKvote(o: { vrsta: VrstaKvote; trazeno: number | null; preostalo: number; limit: number; oslobadaSe: Date | null }): string {
  const trazi = o.trazeno !== null && o.trazeno > o.preostalo ? ` (ovo traži ${o.trazeno})` : "";
  const kad = o.oslobadaSe ? `; prvi krediti vraćaju se u ${kadTekst(o.oslobadaSe)}.` : ".";
  return `Ostalo ti je ${o.preostalo} od ${o.limit} ${IMENICA[o.vrsta]}${trazi}${kad}`;
}

const kolicinaSql = (k: Kolicina) => (typeof k === "number" ? { sql: "?", args: [k] } : k);

/**
 * Naredba potrošnje za isti batch kao posao, ili null kad je količina broj 0 (nema upisa).
 * Logoped: uvjetna (NULL → cijeli batch pada). Superadmin: bezuvjetna. SQL količina 0: bez retka.
 */
export function naredbaPotrosnje(p: Platitelj, vrsta: VrstaKvote, kolicina: Kolicina, izvor: string): D1PreparedStatement | null {
  if (typeof kolicina === "number" && kolicina <= 0) return null;
  const n = kolicinaSql(kolicina);
  const db = env.DB;
  if (p.uloga === "superadmin") {
    return db.prepare(
      `INSERT INTO ai_potrosnja (korisnik_id, vrsta, kolicina, izvor)
       SELECT ?, ?, n.v, ? FROM (SELECT (${n.sql}) AS v) n WHERE n.v > 0`,
    ).bind(p.korisnikId, vrsta, izvor.slice(0, 200), ...n.args);
  }
  return db.prepare(
    `INSERT INTO ai_potrosnja (korisnik_id, vrsta, kolicina, izvor)
     SELECT ?, ?,
       CASE WHEN (SELECT COALESCE(SUM(kolicina), 0) FROM ai_potrosnja WHERE korisnik_id = ? AND vrsta = ? AND ${U_PROZORU}) + n.v
              <= (SELECT ${STUPAC_LIMITA[vrsta]} FROM korisnici WHERE id = ? AND uloga = 'logoped' AND aktivan = 1)
            THEN n.v ELSE NULL END,
       ?
     FROM (SELECT (${n.sql}) AS v) n WHERE n.v > 0`,
  ).bind(p.korisnikId, vrsta, p.korisnikId, vrsta, p.korisnikId, izvor.slice(0, 200), ...n.args);
}

/** Je li greška batcha odbijena potrošnja (D1: „D1_ERROR: NOT NULL constraint failed: ai_potrosnja.kolicina: …”). */
export function jePrekoracenje(e: unknown): boolean {
  const tekst = (x: unknown): string => (x instanceof Error ? `${x.message} ${tekst(x.cause)}` : x == null ? "" : String(x));
  return tekst(e).includes("ai_potrosnja.kolicina");
}

async function prekoracenje(email: string, vrsta: VrstaKvote, kolicina: Kolicina): Promise<KvotaPrekoracena> {
  const p = await platitelj(email);
  if (!p || p.uloga !== "logoped") return KvotaPrekoracena.zabrana(vrsta);
  const n = kolicinaSql(kolicina);
  const trazeno = typeof kolicina === "number" ? kolicina
    : (await env.DB.prepare(`SELECT (${n.sql}) AS v`).bind(...n.args).first<{ v: number }>())?.v ?? null;
  const s = (await preostalo(p.korisnikId))[vrsta];
  const o = { vrsta, trazeno, preostalo: s.preostalo, limit: s.limit, oslobadaSe: await kadSeOslobada(p.korisnikId, vrsta) };
  return new KvotaPrekoracena({ ...o, poruka: porukaKvote(o) });
}

/** Mjesto naredbe potrošnje u `batchSKvotom` kad ne smije biti prva (količina ovisi o ranijim naredbama). */
export const NAPLATA: unique symbol = Symbol("naplata");

/**
 * `db.batch([potrošnja, ...naredbe])` za korisnika `email`; vraća rezultate od `naredbe` (bez potrošnje).
 * Potrošnja je prva, osim kad `naredbe` sadrže `NAPLATA`: tada je na tom mjestu.
 * Prekoračenje ili korisnik bez prava: `KvotaPrekoracena`, ništa nije upisano. Ostale greške prolaze.
 */
export async function batchSKvotom(
  email: string, vrsta: VrstaKvote, kolicina: Kolicina, izvor: string, naredbe: (D1PreparedStatement | typeof NAPLATA)[],
): Promise<D1Result[]> {
  const db = env.DB;
  const ostale = naredbe.filter((x): x is D1PreparedStatement => x !== NAPLATA);
  if (typeof kolicina === "number" && kolicina <= 0) return ostale.length ? db.batch(ostale) : [];
  const p = await platitelj(email);
  if (!p) throw KvotaPrekoracena.zabrana(vrsta);
  const potrosnja = naredbaPotrosnje(p, vrsta, kolicina, izvor)!;
  let mjesto = naredbe.indexOf(NAPLATA);
  if (mjesto < 0) mjesto = 0;
  const sve = [...ostale.slice(0, mjesto), potrosnja, ...ostale.slice(mjesto)];
  try {
    const rez = await db.batch(sve);
    return [...rez.slice(0, mjesto), ...rez.slice(mjesto + 1)];
  } catch (e) {
    if (jePrekoracenje(e)) throw await prekoracenje(email, vrsta, kolicina);
    throw e;
  }
}

/**
 * Provjera unaprijed (nije atomska) za zahtjeve koji prije posla nešto trajno mijenjaju (odluka o
 * slici, nova riječ, kopija situacije): da prekoračenje odbije cijeli zahtjev, a ne samo posao.
 * Pravu naplatu i dalje radi `batchSKvotom`.
 */
export async function provjeri(email: string, vrsta: VrstaKvote, n: number): Promise<void> {
  if (n <= 0) return;
  const p = await platitelj(email);
  if (!p) throw KvotaPrekoracena.zabrana(vrsta);
  if (p.uloga !== "logoped") return;
  const s = (await preostalo(p.korisnikId))[vrsta];
  if (n <= s.preostalo) return;
  const o = { vrsta, trazeno: n, preostalo: s.preostalo, limit: s.limit, oslobadaSe: await kadSeOslobada(p.korisnikId, vrsta) };
  throw new KvotaPrekoracena({ ...o, poruka: porukaKvote(o) });
}

/** Kvota iz adrese nakon 303 (`?kvota=slike|zvukovi`, uz `kvota_n=<traženo>`); sve ostalo je null. */
export function kvotaIzAdrese(p: URLSearchParams): { vrsta: VrstaKvote; trazeno: number | null } | null {
  const vrsta = p.get("kvota");
  if (vrsta !== "slike" && vrsta !== "zvukovi") return null;
  const n = p.get("kvota_n") ?? "";
  return { vrsta, trazeno: /^[1-9]\d{0,5}$/.test(n) ? Number(n) : null };
}

/**
 * Poruka za banner AdminOkvira, sastavljena na serveru za trenutno stanje korisnika (ne iz adrese, pa
 * link ne može podmetnuti tekst). Null kad korisnik kvotu nema (superadmin).
 */
export async function porukaZaKorisnika(email: string, k: { vrsta: VrstaKvote; trazeno: number | null }): Promise<string | null> {
  const p = await platitelj(email);
  if (!p) return KvotaPrekoracena.zabrana(k.vrsta).poruka;
  if (p.uloga !== "logoped") return null;
  const s = (await preostalo(p.korisnikId))[k.vrsta];
  return porukaKvote({ ...k, preostalo: s.preostalo, limit: s.limit, oslobadaSe: await kadSeOslobada(p.korisnikId, k.vrsta) });
}

/**
 * Odgovor na `KvotaPrekoracena` (middleware). JSON (429) za `/api/*`, za `fetch` s JSON tijelom na
 * `/admin/api/*` i za `x-ajax`; obrazac (form POST) dobiva 303 natrag (Referer na istom originu,
 * inače /admin) sa strukturiranim `?kvota=<vrsta>&kvota_n=<traženo>` (`kvotaIzAdrese`); poruku
 * AdminOkvir sastavlja sam (`porukaZaKorisnika`), tekst nikad ne ide kroz adresu.
 */
export function odgovorNaKvotu(e: KvotaPrekoracena, request: Request, url: URL): Response {
  const vrsta = request.headers.get("content-type") ?? "";
  const obrazac = vrsta.startsWith("multipart/form-data") || vrsta.startsWith("application/x-www-form-urlencoded");
  const ajax = request.headers.get("x-ajax") === "1";
  if (url.pathname.startsWith("/api/") || ajax || (url.pathname.startsWith("/admin/api/") && !obrazac)) {
    return new Response(JSON.stringify({ error: "kvota", poruka: e.poruka, greska: e.poruka, ok: false }), {
      status: 429, headers: { "content-type": "application/json" },
    });
  }
  let cilj = new URL("/admin", url);
  try {
    const r = new URL(request.headers.get("referer") ?? "");
    if (r.origin === url.origin && (r.pathname === "/admin" || r.pathname.startsWith("/admin/"))) cilj = r;
  } catch {}
  cilj.hash = "";
  postaviKvotuUAdresu(cilj, e.vrsta, e.trazeno);
  return new Response(null, { status: 303, headers: { location: cilj.pathname + cilj.search } });
}

/** `?kvota=<vrsta>&kvota_n=<n>` na `u` (prijašnje vrijednosti se zamjenjuju). */
export function postaviKvotuUAdresu(u: URL, vrsta: VrstaKvote, trazeno: number | null): URL {
  u.searchParams.set("kvota", vrsta);
  if (trazeno !== null && Number.isInteger(trazeno) && trazeno > 0) u.searchParams.set("kvota_n", String(trazeno));
  else u.searchParams.delete("kvota_n");
  return u;
}
