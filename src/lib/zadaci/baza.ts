// Upiti za zadatke (D1). Pravila verzija: dok aktivnu verziju nitko nije rješavao, uređuje se
// na mjestu; čim postoji rješavanje, spremanje otvara novu verziju (docs/zadaci.md).
import { env } from "cloudflare:workers";
import { brojSlogova, izvediRimu } from "./rima";
import { normaliziraj, type RijecZadatka, type Sadrzaj, type Vrsta } from "./vrste";

const DB = () => env.DB;

export interface Podrucje { id: number; roditelj_id: number | null; naziv: string; slug: string }
export interface ZadatakRed {
  id: number; vrsta: Vrsta; podrucje_id: number | null; naslov: string; uputa: string | null; vidljivost: string;
  aktivna_verzija: number; autor: string; updated_at: string; rjesavanja: number;
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

const SQL_RIJECI = `SELECT r.id, r.rijec, r.rima AS rima_rucno,
    COALESCE((SELECT s.id FROM slike s WHERE s.rijec_id = r.id AND s.status = 'odobrena' ORDER BY s.id DESC LIMIT 1),
             (SELECT s.id FROM slike s WHERE s.rijec_id = r.id AND s.status = 'kandidat' ORDER BY s.id DESC LIMIT 1)) AS slika_id
  FROM rijeci r`;

type RijecRedak = { id: number; rijec: string; rima_rucno: string | null; slika_id: number | null };
const uZadatak = (r: RijecRedak): RijecZadatka => ({
  id: r.id, rijec: r.rijec, rima: r.rima_rucno ?? izvediRimu(r.rijec), slogova: brojSlogova(r.rijec),
  slika: r.slika_id ? `/admin/slika/${r.slika_id}` : null,
});

/** Sve aktivne riječi s rimom i najboljom slikom (odobrena, inače zadnji kandidat). */
export async function sveRijeci(): Promise<RijecZadatka[]> {
  const { results } = await DB().prepare(`${SQL_RIJECI} WHERE r.aktivna = 1 ORDER BY r.rijec COLLATE NOCASE`).all<RijecRedak>();
  return results.map(uZadatak);
}

export async function rijeciPoId(ids: number[]): Promise<RijecZadatka[]> {
  if (!ids.length) return [];
  const { results } = await DB().prepare(`${SQL_RIJECI} WHERE r.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<RijecRedak>();
  return results.map(uZadatak);
}

const SQL_ZADATAK = `SELECT z.id, z.vrsta, z.podrucje_id, z.naslov, z.uputa, z.vidljivost, z.aktivna_verzija, z.updated_at,
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

export interface Izmjena { naslov: string; uputa: string; podrucje_id: number | null; sadrzaj: unknown }

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
      "UPDATE zadaci SET naslov = ?, uputa = ?, podrucje_id = ?, aktivna_verzija = ?, updated_at = datetime('now') WHERE id = ?",
    ).bind(x.naslov.slice(0, 200), x.uputa.slice(0, 400) || null, x.podrucje_id, verzija, id),
  ]);
  return verzija;
}

export async function obrisi(id: number) {
  await DB().prepare("UPDATE zadaci SET obrisan_at = datetime('now') WHERE id = ?").bind(id).run();
}
