// Pozadine scena (migrations/0010_scena.sql, docs/zadaci.md „scena”): situacija s do dvije
// slike, uspravnom i vodoravnom. Admin ih učitava i odmah su javne: ista datoteka ide u
// privatni bucket (izvornik) i u javni (cdn.logomedo.com), ključ sadrži hash sadržaja.
import { env } from "cloudflare:workers";
import { dimenzije, orijentacija, type Dimenzije } from "./dimenzije";
import { javniUrl, MAX_BAJTOVA, MIME, ocistiCache } from "./generiranje";

const DB = () => env.DB;
export type Orijentacija = "uspravno" | "vodoravno";
export const ORIJENTACIJE: Orijentacija[] = ["uspravno", "vodoravno"];

export interface SlikaPozadine extends Dimenzije { url: string }
export interface Pozadina { id: number; naziv: string; opis: string | null; uspravno: SlikaPozadine | null; vodoravno: SlikaPozadine | null }

type Redak = { id: number; naziv: string; opis: string | null; orijentacija: Orijentacija | null; r2_kljuc: string | null; sirina: number | null; visina: number | null };

/**
 * `isti`: URL na istom originu (/cdn/<ključ>, čita javni bucket kroz Worker). Admin ga koristi
 * jer radi i lokalno (lokalni R2), a javne stranice idu na cdn.logomedo.com.
 */
const url = (kljuc: string, isti: boolean) => (isti ? `/cdn/${kljuc}` : javniUrl(kljuc));

function slozi(redovi: Redak[], isti = false): Pozadina[] {
  const m = new Map<number, Pozadina>();
  for (const r of redovi) {
    const p = m.get(r.id) ?? { id: r.id, naziv: r.naziv, opis: r.opis, uspravno: null, vodoravno: null };
    if (r.orijentacija && r.r2_kljuc) p[r.orijentacija] = { url: url(r.r2_kljuc, isti), sirina: r.sirina!, visina: r.visina! };
    m.set(r.id, p);
  }
  return [...m.values()];
}

const SQL = `SELECT p.id, p.naziv, p.opis, s.orijentacija, s.r2_kljuc, s.sirina, s.visina
  FROM pozadine p LEFT JOIN pozadina_slike s ON s.pozadina_id = p.id`;

export async function popis(isti = true): Promise<Pozadina[]> {
  return slozi((await DB().prepare(`${SQL} WHERE p.obrisan_at IS NULL ORDER BY p.updated_at DESC, p.id DESC`).all<Redak>()).results, isti);
}

/** I obrisane: stara verzija zadatka i dalje prikazuje svoju pozadinu. */
export async function poIds(ids: number[]): Promise<Pozadina[]> {
  if (!ids.length) return [];
  return slozi((await DB().prepare(`${SQL} WHERE p.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<Redak>()).results);
}

export async function stvori(naziv: string, opis: string, autorId: number): Promise<number> {
  const r = await DB().prepare("INSERT INTO pozadine (naziv, opis, autor_id) VALUES (?, ?, ?) RETURNING id")
    .bind(naziv.trim().slice(0, 120), opis.trim().slice(0, 1000) || null, autorId).first<{ id: number }>();
  return r!.id;
}

export async function uredi(id: number, naziv: string, opis: string) {
  await DB().prepare("UPDATE pozadine SET naziv = ?, opis = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(naziv.trim().slice(0, 120), opis.trim().slice(0, 1000) || null, id).run();
}

/**
 * Učitaj sliku pozadine. Orijentacija se čita iz dimenzija; ako već postoji slika te
 * orijentacije, zamjenjuje se (stara se briše iz oba bucketa i iz edge cachea).
 */
export async function ucitajSliku(pozadinaId: number, mime: string, tijelo: ArrayBuffer, prompt: string | null, email: string,
  o2: { ocekivana?: Orijentacija; izvor?: "upload" | "agy" } = {}): Promise<{ orijentacija: Orijentacija } | { greska: string }> {
  const ext = MIME[mime];
  if (!ext) return { greska: `nepodržan tip ${mime || "(nepoznat)"}; samo PNG, JPEG ili WebP` };
  if (!tijelo.byteLength || tijelo.byteLength > MAX_BAJTOVA) return { greska: "prazna ili prevelika slika (najviše 8 MB)" };
  const d = dimenzije(new Uint8Array(tijelo));
  if (!d || !d.sirina || !d.visina) return { greska: "ne mogu pročitati dimenzije slike" };
  if (Math.min(d.sirina, d.visina) < 600) return { greska: `slika je premala (${d.sirina}×${d.visina}); treba barem 600 px po kraćoj strani` };
  if (d.sirina === d.visina) return { greska: "kvadratna slika nema orijentaciju; izreži je na 4:3 ili 3:4" };
  if (Math.max(d.sirina, d.visina) / Math.min(d.sirina, d.visina) > 2.2) return { greska: "preuska slika; scena treba omjer ekrana (npr. 4:3 ili 3:4)" };
  const o = orijentacija(d);
  if (o2.ocekivana && o !== o2.ocekivana) return { greska: `model je vratio ${o} sliku (${d.sirina}×${d.visina}), a traži se ${o2.ocekivana}` };
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", tijelo))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const kljuc = `pozadine/${pozadinaId}/${hash.slice(0, 16)}.${ext}`;
  const stara = await DB().prepare("SELECT r2_kljuc FROM pozadina_slike WHERE pozadina_id = ? AND orijentacija = ?")
    .bind(pozadinaId, o).first<{ r2_kljuc: string }>();
  if (stara?.r2_kljuc === kljuc) return { orijentacija: o };
  const meta = { contentType: mime, cacheControl: "public, max-age=31536000, immutable" };
  await env.SLIKE.put(kljuc, tijelo, { httpMetadata: { contentType: mime } });
  await env.JAVNO.put(kljuc, tijelo, { httpMetadata: meta });
  await DB().batch([
    DB().prepare("DELETE FROM pozadina_slike WHERE pozadina_id = ? AND orijentacija = ?").bind(pozadinaId, o),
    DB().prepare(
      `INSERT INTO pozadina_slike (pozadina_id, orijentacija, r2_kljuc, sha256, mime, bajtova, sirina, visina, prompt, ucitao, izvor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(pozadinaId, o, kljuc, hash, mime, tijelo.byteLength, d.sirina, d.visina, prompt, email, o2.izvor ?? "upload"),
    DB().prepare("UPDATE pozadine SET updated_at = datetime('now') WHERE id = ?").bind(pozadinaId),
  ]);
  if (stara) await makniDatoteku(stara.r2_kljuc);
  return { orijentacija: o };
}

async function makniDatoteku(kljuc: string) {
  await env.SLIKE.delete(kljuc);
  await env.JAVNO.delete(kljuc);
  await ocistiCache(javniUrl(kljuc));
}

export async function makniSliku(pozadinaId: number, o: Orijentacija) {
  const s = await DB().prepare("DELETE FROM pozadina_slike WHERE pozadina_id = ? AND orijentacija = ? RETURNING r2_kljuc")
    .bind(pozadinaId, o).first<{ r2_kljuc: string }>();
  if (s) await makniDatoteku(s.r2_kljuc);
}

/** Koliko zadataka (aktivna verzija) koristi pozadinu: briše se samo nekorištena. */
export async function koristi(pozadinaId: number): Promise<number> {
  const r = await DB().prepare(
    `SELECT COUNT(*) AS n FROM zadaci z JOIN zadatak_verzije v ON v.zadatak_id = z.id AND v.verzija = z.aktivna_verzija
     WHERE z.obrisan_at IS NULL AND z.vrsta = 'scena' AND json_extract(v.sadrzaj, '$.pozadina_id') = ?`,
  ).bind(pozadinaId).first<{ n: number }>();
  return r?.n ?? 0;
}

/** Meko brisanje; datoteke ostaju jer ih stare verzije zadataka i dalje mogu prikazivati. */
export async function obrisi(pozadinaId: number) {
  await DB().prepare("UPDATE pozadine SET obrisan_at = datetime('now') WHERE id = ?").bind(pozadinaId).run();
}

/** Pozadine koje sadržaji spominju (za editor, igru i ispis). */
export function pozadineU(sadrzaji: { vrsta: string; sadrzaj: unknown }[]): number[] {
  return [...new Set(sadrzaji.flatMap((z) => {
    const id = z.vrsta === "scena" ? (z.sadrzaj as { pozadina_id?: number | null }).pozadina_id : null;
    return id ? [id] : [];
  }))];
}
