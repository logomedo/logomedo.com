// Uređaji po računu (docs/uredaji.md, migracija 0044): račun smije biti otvoren na najviše N
// uređaja istovremeno (logoped: 2). Uređaj je preglednik s kolačićem UREDAJ_COOKIE; tabovi i prozori
// istog preglednika su jedan uređaj. Treći uređaj ne dobiva zabranu nego izbor „Nastavi ovdje”, koji
// odjavi jedan od aktivnih. Jednoj osobi to ništa ne smeta (nije za dva računala odjednom), a
// ekipi koja dijeli jedan račun ruši rad svaki put kad netko novi sjedne.
//
// Provedba: env.UREDAJI_PROVEDBA. Bez njega se uređaji samo bilježe (pregled na /admin/korisnici);
// "logoped" = provodi se za logopede; "svi" = i za superadmina (za testiranje na stagingu).
import { env } from "cloudflare:workers";
import { randomToken, readCookie, sha256Hex, type Session } from "./sesija";

export const UREDAJ_COOKIE = "__Host-logomedo_uredaj";
const UREDAJ_COOKIE_S = 400 * 24 * 3600;
/** Uređaj je „u upotrebi” ako je s njega bio zahtjev u zadnjih toliko minuta. */
export const AKTIVAN_MIN = 15;
/** zadnji_put se ne piše češće od ovoga (svaki zahtjev bi inače bio upis u D1). */
const DODIR_S = 60;
export const ZADANI_LIMIT_UREDAJA = 2;
export const LIMIT_UREDAJA_MAX = 20;
const CUVAJ_UREDAJ_DANA = 90;
const CUVAJ_DOGADAJ_DANA = 180;

export interface Uredaj {
  id: number;
  kljuc_hash: string;
  naziv: string;
  created_at: string;
  zadnji_put: string;
  grad: string | null;
  drzava: string | null;
  mreza: string | null;
  mreza_hash: string | null;
  odjavljen_at: string | null;
  odjavio_id: number | null;
}

export type Provedba = "biljezi" | "logoped" | "svi";
export const provedba = (): Provedba => {
  const v = (env.UREDAJI_PROVEDBA ?? "").trim();
  return v === "logoped" || v === "svi" ? v : "biljezi";
};

/** Limit za sesiju; null = bez limita (samo bilježenje). */
export function limitZa(uloga: Session["uloga"], limitRetka: number | null, p: Provedba): number | null {
  if (p === "biljezi") return null;
  if (uloga === "superadmin" && p !== "svi") return null;
  return limitRetka ?? ZADANI_LIMIT_UREDAJA;
}

export const aktivan = (u: Pick<Uredaj, "zadnji_put" | "odjavljen_at">, sadaMs: number) =>
  !u.odjavljen_at && sadaMs - Date.parse(u.zadnji_put) < AKTIVAN_MIN * 60_000;

export type Odluka = { dopusti: true } | { dopusti: false; aktivni: Uredaj[] };

/**
 * Smije li ovaj uređaj raditi. Uređaj koji je već aktivan zadržava mjesto (tabovi, osvježavanje);
 * neaktivan (nov, odjavljen, dugo neviđen) ulazi samo ako drugih aktivnih ima manje od limita.
 */
export function odluci(svi: Uredaj[], ovajHash: string, limit: number | null, sadaMs: number): Odluka {
  if (limit === null) return { dopusti: true };
  const ovaj = svi.find((u) => u.kljuc_hash === ovajHash);
  if (ovaj && aktivan(ovaj, sadaMs)) return { dopusti: true };
  const aktivni = svi
    .filter((u) => u.kljuc_hash !== ovajHash && aktivan(u, sadaMs))
    .sort((a, b) => b.zadnji_put.localeCompare(a.zadnji_put));
  return aktivni.length < limit ? { dopusti: true } : { dopusti: false, aktivni };
}

/** Kratak opis preglednika za ljude („Chrome · Windows”). Nije identifikacija, samo oznaka u popisu. */
export function opisUA(ua: string | null): string {
  if (!ua) return "Nepoznat preglednik";
  const preglednik =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox\/|FxiOS/.test(ua) ? "Firefox"
    : /CriOS|Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Preglednik";
  const sustav =
    /iPad/.test(ua) ? "iPad"
    : /iPhone/.test(ua) ? "iPhone"
    : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android mobitel" : "Android tablet")
    : /Windows/.test(ua) ? "Windows"
    : /CrOS/.test(ua) ? "ChromeOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "nepoznat sustav";
  return `${preglednik} · ${sustav}`;
}

/** Mreža bez pune IP adrese: /24 za IPv4, /48 za IPv6, hash skraćen na 16 znakova. */
export async function mrezaHash(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  let prefiks: string;
  if (ip.includes(":")) prefiks = ip.toLowerCase().split(":").slice(0, 3).join(":") + "::/48";
  else prefiks = ip.split(".").slice(0, 3).join(".") + ".0/24";
  return (await sha256Hex(`logomedo-mreza:${env.PRISTUP_TAJNA ?? ""}:${prefiks}`)).slice(0, 16);
}

interface Mjesto { grad: string | null; drzava: string | null; mreza: string | null; mreza_hash: string | null }

async function mjesto(request: Request): Promise<Mjesto> {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf ?? {};
  const s = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : null);
  return {
    grad: s(cf.city, 80),
    drzava: s(cf.country, 8),
    mreza: s(cf.asOrganization, 120),
    mreza_hash: await mrezaHash(request.headers.get("cf-connecting-ip")),
  };
}

export const uredajKolacic = (kljuc: string) =>
  `${UREDAJ_COOKIE}=${kljuc}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${UREDAJ_COOKIE_S}`;

export type Provjera =
  | { ok: true; setCookie: string | null }
  | { ok: false; setCookie: string | null; aktivni: Uredaj[]; ovaj: Uredaj | null; preuzeo: Uredaj | null };

async function ucitaj(email: string): Promise<{ svi: Uredaj[]; limitRetka: number | null }> {
  const [u, k] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, kljuc_hash, naziv, created_at, zadnji_put, grad, drzava, mreza, mreza_hash, odjavljen_at, odjavio_id
       FROM uredaji WHERE email = ? AND zadnji_put > ? ORDER BY zadnji_put DESC LIMIT 50`,
    ).bind(email, new Date(Date.now() - CUVAJ_UREDAJ_DANA * 86_400_000).toISOString()),
    env.DB.prepare("SELECT limit_uredaja FROM korisnici WHERE email = ?").bind(email),
  ]);
  const red = (k.results[0] as { limit_uredaja: number | null } | undefined) ?? null;
  return { svi: u.results as unknown as Uredaj[], limitRetka: red?.limit_uredaja ?? null };
}

const dogadaj = (email: string, uredajId: number, vrsta: string, m: Partial<Mjesto>, drugiId: number | null = null) =>
  env.DB.prepare(
    "INSERT INTO uredaji_dogadaji (email, uredaj_id, vrsta, drugi_id, grad, mreza, mreza_hash, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(email, uredajId, vrsta, drugiId, m.grad ?? null, m.mreza ?? null, m.mreza_hash ?? null, new Date().toISOString());

/**
 * Pri svakom zahtjevu pod /admin (sa sesijom): upiše ili osvježi uređaj i odluči smije li raditi.
 * Kolačić uređaja se postavlja ako ga nema (i kad uređaj ne smije, da „Nastavi ovdje” zna tko je).
 */
export async function provjeriUredaj(request: Request, s: Session): Promise<Provjera> {
  const email = s.email.trim().toLowerCase();
  let kljuc = readCookie(request.headers.get("cookie"), UREDAJ_COOKIE);
  let setCookie: string | null = null;
  if (!kljuc || !/^[A-Za-z0-9_-]{20,100}$/.test(kljuc)) {
    kljuc = randomToken();
    setCookie = uredajKolacic(kljuc);
  }
  const hash = await sha256Hex(kljuc);
  const { svi, limitRetka } = await ucitaj(email);
  const sadaMs = Date.now();
  const sada = new Date(sadaMs).toISOString();
  const ovaj = svi.find((u) => u.kljuc_hash === hash) ?? null;
  const odluka = odluci(svi, hash, limitZa(s.uloga, limitRetka, provedba()), sadaMs);

  if (!odluka.dopusti) {
    // Jednom po uređaju u 15 min, da dnevnik ne raste od osvježavanja.
    if (ovaj && !(ovaj.odjavljen_at && sadaMs - Date.parse(ovaj.odjavljen_at) < AKTIVAN_MIN * 60_000)) {
      await dogadaj(email, ovaj.id, "previse", await mjesto(request)).run().catch(() => {});
    }
    const preuzeo = ovaj?.odjavio_id ? svi.find((u) => u.id === ovaj.odjavio_id) ?? null : null;
    return { ok: false, setCookie, aktivni: odluka.aktivni, ovaj, preuzeo };
  }

  if (!ovaj) {
    const m = await mjesto(request);
    const novi = await env.DB.prepare(
      `INSERT INTO uredaji (email, kljuc_hash, naziv, created_at, zadnji_put, grad, drzava, mreza, mreza_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (email, kljuc_hash) DO UPDATE SET zadnji_put = excluded.zadnji_put, odjavljen_at = NULL
       RETURNING id`,
    ).bind(email, hash, opisUA(request.headers.get("user-agent")), sada, sada, m.grad, m.drzava, m.mreza, m.mreza_hash)
      .first<{ id: number }>();
    if (novi) {
      await env.DB.batch([
        dogadaj(email, novi.id, "novi", m),
        env.DB.prepare("DELETE FROM uredaji WHERE zadnji_put < ?")
          .bind(new Date(sadaMs - CUVAJ_UREDAJ_DANA * 86_400_000).toISOString()),
        env.DB.prepare("DELETE FROM uredaji_dogadaji WHERE at < ?")
          .bind(new Date(sadaMs - CUVAJ_DOGADAJ_DANA * 86_400_000).toISOString()),
      ]).catch(() => {});
    }
  } else if (ovaj.odjavljen_at || sadaMs - Date.parse(ovaj.zadnji_put) > DODIR_S * 1000) {
    const m = await mjesto(request);
    const upiti = [
      env.DB.prepare(
        "UPDATE uredaji SET zadnji_put = ?, odjavljen_at = NULL, odjavio_id = NULL, grad = ?, drzava = ?, mreza = ?, mreza_hash = ? WHERE id = ?",
      ).bind(sada, m.grad, m.drzava, m.mreza, m.mreza_hash, ovaj.id),
    ];
    if (m.mreza_hash && m.mreza_hash !== ovaj.mreza_hash) upiti.push(dogadaj(email, ovaj.id, "mreza", m));
    await env.DB.batch(upiti).catch(() => {});
  }
  return { ok: true, setCookie };
}

/** Hash uređaja iz zahtjeva (null ako nema kolačića). */
export async function ovajUredajHash(request: Request): Promise<string | null> {
  const k = readCookie(request.headers.get("cookie"), UREDAJ_COOKIE);
  return k ? sha256Hex(k) : null;
}

/**
 * Odjavi uređaj `id` istog računa. `odjavio` je uređaj koji preuzima („Nastavi ovdje”), ili null
 * kad korisnik sam odjavi uređaj iz Postavki. Ne briše sesiju: uređaj se vrati sam kad se mjesto
 * oslobodi, a do tada vidi stranicu s izborom.
 */
export async function odjaviUredaj(email: string, id: number, odjavio: number | null, request: Request): Promise<boolean> {
  email = email.trim().toLowerCase();
  const r = await env.DB.prepare(
    "UPDATE uredaji SET odjavljen_at = ?, odjavio_id = ? WHERE id = ? AND email = ? AND odjavljen_at IS NULL RETURNING id",
  ).bind(new Date().toISOString(), odjavio, id, email).first<{ id: number }>();
  if (!r) return false;
  const m = await mjesto(request);
  await dogadaj(email, odjavio ?? id, odjavio ? "preuzimanje" : "odjava", m, id).run().catch(() => {});
  return true;
}

/**
 * „Nastavi ovdje”: odjavi zadani aktivni uređaj (ili najdavnije korišteni) i upiše ovaj kao aktivan.
 * Vraća false ako ovaj uređaj nema kolačić (stranica ga je trebala postaviti).
 */
export async function preuzmi(request: Request, s: Session, ciljId: number | null): Promise<boolean> {
  const email = s.email.trim().toLowerCase();
  const hash = await ovajUredajHash(request);
  if (!hash) return false;
  const { svi } = await ucitaj(email);
  const sadaMs = Date.now();
  const aktivni = svi.filter((u) => u.kljuc_hash !== hash && aktivan(u, sadaMs))
    .sort((a, b) => a.zadnji_put.localeCompare(b.zadnji_put));
  const cilj = (ciljId !== null ? aktivni.find((u) => u.id === ciljId) : null) ?? aktivni[0];
  const m = await mjesto(request);
  const sada = new Date(sadaMs).toISOString();
  const ovaj = await env.DB.prepare(
    `INSERT INTO uredaji (email, kljuc_hash, naziv, created_at, zadnji_put, grad, drzava, mreza, mreza_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (email, kljuc_hash) DO UPDATE SET zadnji_put = excluded.zadnji_put, odjavljen_at = NULL, odjavio_id = NULL
     RETURNING id, (created_at = zadnji_put) AS nov`,
  ).bind(email, hash, opisUA(request.headers.get("user-agent")), sada, sada, m.grad, m.drzava, m.mreza, m.mreza_hash)
    .first<{ id: number; nov: number }>();
  if (!ovaj) return false;
  if (ovaj.nov) await dogadaj(email, ovaj.id, "novi", m).run().catch(() => {});
  if (cilj) await odjaviUredaj(email, cilj.id, ovaj.id, request);
  return true;
}

/** Popis za Postavke: uređaji zadnjih 90 dana, ovaj označen. */
export async function mojiUredaji(email: string, request: Request) {
  const { svi } = await ucitaj(email.trim().toLowerCase());
  const hash = await ovajUredajHash(request);
  const sadaMs = Date.now();
  return svi.map((u) => ({ ...u, ovaj: u.kljuc_hash === hash, aktivan: aktivan(u, sadaMs) }));
}

export interface SazetakUredaja {
  aktivnih: number;
  uredaja30: number;
  mreza30: number;
  gradova30: number;
  preuzimanja7: number;
  previse7: number;
}

/** Za /admin/korisnici: po e-mailu, jednim upitom. */
export async function sazeciUredaja(): Promise<Map<string, SazetakUredaja>> {
  const sada = Date.now();
  const d30 = new Date(sada - 30 * 86_400_000).toISOString();
  const d7 = new Date(sada - 7 * 86_400_000).toISOString();
  const akt = new Date(sada - AKTIVAN_MIN * 60_000).toISOString();
  const { results } = await env.DB.prepare(
    `WITH
       u AS (SELECT email, SUM(CASE WHEN zadnji_put > ?3 AND odjavljen_at IS NULL THEN 1 ELSE 0 END) AS aktivnih,
               COUNT(*) AS uredaja30 FROM uredaji WHERE zadnji_put > ?1 GROUP BY email),
       m AS (SELECT email, COUNT(DISTINCT mreza_hash) AS mreza30, COUNT(DISTINCT grad) AS gradova30 FROM (
               SELECT email, mreza_hash, grad FROM uredaji_dogadaji WHERE at > ?1
               UNION ALL SELECT email, mreza_hash, grad FROM uredaji WHERE zadnji_put > ?1) GROUP BY email),
       d AS (SELECT email, SUM(vrsta = 'preuzimanje') AS preuzimanja7, SUM(vrsta = 'previse') AS previse7
             FROM uredaji_dogadaji WHERE at > ?2 GROUP BY email)
     SELECT u.email, u.aktivnih, u.uredaja30, COALESCE(m.mreza30, 0) AS mreza30, COALESCE(m.gradova30, 0) AS gradova30,
       COALESCE(d.preuzimanja7, 0) AS preuzimanja7, COALESCE(d.previse7, 0) AS previse7
     FROM u LEFT JOIN m ON m.email = u.email LEFT JOIN d ON d.email = u.email`,
  ).bind(d30, d7, akt).all<SazetakUredaja & { email: string }>();
  return new Map(results.map(({ email, ...s }) => [email, s]));
}

/** Superadmin postavlja limit logopedu; null = zadano. */
export function procitajLimitUredaja(v: unknown): number | null | undefined {
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v !== "string" || !/^\s*\d{1,2}\s*$/.test(v)) return undefined;
  const n = Number(v.trim());
  return n >= 1 && n <= LIMIT_UREDAJA_MAX ? n : undefined;
}
