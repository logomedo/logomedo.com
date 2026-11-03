// Upiti za zadatke (D1). Pravila verzija: dok aktivnu verziju nitko nije rješavao, uređuje se
// na mjestu; čim postoji rješavanje, spremanje otvara novu verziju (docs/zadaci.md).
import { env } from "cloudflare:workers";
import { brojSlogova, izvediRimu } from "./rima";
import { normaliziraj, slikaUStilu, type RijecZadatka, type SlikeRijeci, type Sadrzaj, type Vrsta } from "./vrste";

const DB = () => env.DB;

export interface Podrucje { id: number; roditelj_id: number | null; naziv: string; slug: string }
export interface ZadatakRed {
  id: number; vrsta: Vrsta; podrucje_id: number | null; naslov: string; uputa: string | null; vidljivost: string;
  aktivna_verzija: number; autor: string; updated_at: string; rjesavanja: number; stil: string;
}
export interface Zadatak extends ZadatakRed { sadrzaj: Sadrzaj }

export async function podrucja(): Promise<Podrucje[]> {
  return (await DB().prepare("SELECT id, roditelj_id, naziv, slug FROM podrucja ORDER BY redoslijed, id").all<Podrucje>()).results;
}

/** Naziv „Područje › podpodručje”. */
export function nazivPodrucja(sva: Podrucje[], id: number | null): string {
  const p = sva.find((x) => x.id === id);
  if (!p) return "Bez područja";
  const r = sva.find((x) => x.id === p.roditelj_id);
  return r ? `${r.naziv} › ${p.naziv}` : p.naziv;
}

/** Autor zadatka: admin dobiva redak u `korisnici` pri prvom spremanju. */
export async function korisnikId(email: string): Promise<number> {
  const r = await DB().prepare(
    `INSERT INTO korisnici (email, uloga) VALUES (?, 'admin')
     ON CONFLICT(email) DO UPDATE SET email = excluded.email RETURNING id`,
  ).bind(email.toLowerCase()).first<{ id: number }>();
  return r!.id;
}

const SQL_RIJECI = `SELECT r.id, r.rijec, r.rima AS rima_rucno FROM rijeci r`;

type RijecRedak = { id: number; rijec: string; rima_rucno: string | null };

/** Stilovi za izbor u editoru zadatka. */
export async function stilovi(): Promise<{ kod: string; naziv: string }[]> {
  return (await DB().prepare("SELECT kod, naziv FROM stilovi WHERE aktivan = 1 ORDER BY id").all<{ kod: string; naziv: string }>()).results;
}

/**
 * Riječi s po jednom slikom za svaki stil (`slike[kod]`): odobrena, inače zadnji kandidat.
 * `slika` je slika u stilu `stil`; kad riječ u njemu nema sliku, uzima se drugi stil.
 */
async function sRijecima(rijeci: RijecRedak[], stil: string): Promise<RijecZadatka[]> {
  const { results } = await DB().prepare(
    `SELECT s.id, s.rijec_id, st.kod, s.status = 'odobrena' AS ok FROM slike s JOIN stilovi st ON st.id = s.stil_id
     WHERE s.status IN ('odobrena', 'kandidat') AND s.rijec_id IN (SELECT value FROM json_each(?))
     ORDER BY s.status = 'odobrena' DESC, s.id DESC`,
  ).bind(JSON.stringify(rijeci.map((r) => r.id))).all<{ id: number; rijec_id: number; kod: string; ok: number }>();
  const slike = new Map<number, SlikeRijeci>();
  for (const s of results) {
    const m = slike.get(s.rijec_id) ?? {};
    if (!(s.kod in m)) m[s.kod] = { src: `/admin/slika/${s.id}`, ok: !!s.ok };
    slike.set(s.rijec_id, m);
  }
  return rijeci.map((r) => {
    const m: SlikeRijeci = slike.get(r.id) ?? {};
    return {
      id: r.id, rijec: r.rijec, rima: r.rima_rucno ?? izvediRimu(r.rijec), slogova: brojSlogova(r.rijec),
      slika: slikaUStilu(m, stil), slike: m,
    };
  });
}

/** Sve aktivne riječi s rimom i slikama po stilu. */
export async function sveRijeci(stil = "ilustracija"): Promise<RijecZadatka[]> {
  const { results } = await DB().prepare(`${SQL_RIJECI} WHERE r.aktivna = 1 ORDER BY r.rijec COLLATE NOCASE`).all<RijecRedak>();
  return sRijecima(results, stil);
}

export async function rijeciPoId(ids: number[], stil = "ilustracija"): Promise<RijecZadatka[]> {
  if (!ids.length) return [];
  const { results } = await DB().prepare(`${SQL_RIJECI} WHERE r.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<RijecRedak>();
  return sRijecima(results, stil);
}

const SQL_ZADATAK = `SELECT z.id, z.vrsta, z.podrucje_id, z.naslov, z.uputa, z.vidljivost, z.aktivna_verzija, z.updated_at, z.stil,
    k.email AS autor, (SELECT COUNT(*) FROM rjesavanja r WHERE r.zadatak_id = z.id) AS rjesavanja
  FROM zadaci z JOIN korisnici k ON k.id = z.autor_id`;

export async function popis(): Promise<ZadatakRed[]> {
  return (await DB().prepare(`${SQL_ZADATAK} WHERE z.obrisan_at IS NULL ORDER BY z.updated_at DESC`).all<ZadatakRed>()).results;
}

export async function zadatak(id: number): Promise<Zadatak | null> {
  const z = await DB().prepare(`${SQL_ZADATAK} WHERE z.id = ? AND z.obrisan_at IS NULL`).bind(id).first<ZadatakRed>();
  if (!z) return null;
  const v = await DB().prepare("SELECT sadrzaj FROM zadatak_verzije WHERE zadatak_id = ? AND verzija = ?")
    .bind(id, z.aktivna_verzija).first<{ sadrzaj: string }>();
  return { ...z, sadrzaj: normaliziraj(z.vrsta, JSON.parse(v?.sadrzaj ?? "{}")) };
}

export async function stvori(autorId: number, vrsta: Vrsta, podrucjeId: number | null, naslov: string, uputa: string, sadrzaj: Sadrzaj): Promise<number> {
  const z = await DB().prepare(
    "INSERT INTO zadaci (autor_id, vrsta, podrucje_id, naslov, uputa) VALUES (?, ?, ?, ?, ?) RETURNING id",
  ).bind(autorId, vrsta, podrucjeId, naslov, uputa || null).first<{ id: number }>();
  await DB().prepare("INSERT INTO zadatak_verzije (zadatak_id, verzija, sadrzaj) VALUES (?, 1, ?)").bind(z!.id, JSON.stringify(sadrzaj)).run();
  return z!.id;
}

export interface Izmjena { naslov: string; uputa: string; podrucje_id: number | null; stil: string; sadrzaj: unknown }

/** Spremi; vraća verziju u koju je spremljeno. */
export async function spremi(id: number, x: Izmjena): Promise<number | null> {
  const z = await DB().prepare(
    `SELECT vrsta, aktivna_verzija, EXISTS (SELECT 1 FROM rjesavanja r WHERE r.zadatak_id = z.id AND r.verzija = z.aktivna_verzija) AS rjesavano
     FROM zadaci z WHERE id = ? AND obrisan_at IS NULL`,
  ).bind(id).first<{ vrsta: Vrsta; aktivna_verzija: number; rjesavano: number }>();
  if (!z) return null;
  const sadrzaj = JSON.stringify(normaliziraj(z.vrsta, x.sadrzaj));
  const verzija = z.rjesavano ? z.aktivna_verzija + 1 : z.aktivna_verzija;
  await DB().batch([
    DB().prepare(
      `INSERT INTO zadatak_verzije (zadatak_id, verzija, sadrzaj) VALUES (?1, ?2, ?3)
       ON CONFLICT(zadatak_id, verzija) DO UPDATE SET sadrzaj = excluded.sadrzaj`,
    ).bind(id, verzija, sadrzaj),
    DB().prepare(
      `UPDATE zadaci SET naslov = ?, uputa = ?, podrucje_id = ?, aktivna_verzija = ?, updated_at = datetime('now'),
         stil = COALESCE((SELECT kod FROM stilovi WHERE kod = ?), stil) WHERE id = ?`,
    ).bind(x.naslov.slice(0, 200), x.uputa.slice(0, 400) || null, x.podrucje_id, verzija, x.stil, id),
  ]);
  return verzija;
}

export async function obrisi(id: number) {
  await DB().prepare("UPDATE zadaci SET obrisan_at = datetime('now') WHERE id = ?").bind(id).run();
}
