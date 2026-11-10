// Upiti za znakove u katalogu (src/lib/znakovi.ts, docs/katalog.md „Znakovi”).
import { env } from "cloudflare:workers";
import { novaGrupa, sZapisom } from "./aktivnost";
import { rijeciU, type Sadrzaj, type Vrsta } from "./zadaci/vrste";
import { normalizirajZnak, slugZnaka, usporediZnakove } from "./znakovi";

const DB = () => env.DB;

export interface Znak { id: number; znak: string; slug: string; aktivna: boolean; zadataka: number }

/** Svi znakovi (i skriveni) s brojem zadataka koji ih koriste u aktivnoj verziji. */
export async function sviZnakovi(): Promise<Znak[]> {
  const [zn, zad] = await DB().batch([
    DB().prepare("SELECT id, rijec AS znak, slug, aktivna FROM rijeci WHERE vrsta = 'znak'"),
    DB().prepare(
      `SELECT z.vrsta, v.sadrzaj FROM zadaci z JOIN zadatak_verzije v ON v.zadatak_id = z.id AND v.verzija = z.aktivna_verzija
       WHERE z.obrisan_at IS NULL`,
    ),
  ]);
  const koliko = new Map<number, number>();
  for (const z of zad.results as { vrsta: Vrsta; sadrzaj: string }[]) {
    let s: Sadrzaj;
    try { s = JSON.parse(z.sadrzaj); } catch { continue; }
    for (const id of rijeciU(z.vrsta, s)) koliko.set(id, (koliko.get(id) ?? 0) + 1);
  }
  return (zn.results as { id: number; znak: string; slug: string; aktivna: number }[])
    .map((r) => ({ id: r.id, znak: r.znak, slug: r.slug, aktivna: !!r.aktivna, zadataka: koliko.get(r.id) ?? 0 }))
    .sort((a, b) => usporediZnakove(a.znak, b.znak));
}

/** Novi znak (ili vraćanje skrivenog). Greška kad je unos neispravan ili je to već riječ. */
export async function noviZnak(unos: unknown, tko: string): Promise<{ id: number } | { greska: string }> {
  const z = normalizirajZnak(unos);
  if (!z) return { greska: "Znak je jedan do tri znaka bez razmaka (b, DŽ, 10, +)." };
  const postoji = await DB().prepare("SELECT id, vrsta FROM rijeci WHERE rijec = ? OR slug = ?").bind(z, slugZnaka(z)).first<{ id: number; vrsta: string }>();
  if (postoji && postoji.vrsta !== "znak") return { greska: `„${z}” je već riječ u katalogu.` };
  const kljuc = { sql: "SELECT id FROM rijeci WHERE rijec = ? AND vrsta = 'znak'", args: [z] };
  await DB().batch(sZapisom({ tko, radnja: postoji ? "znak.vracen" : "znak.novi", tablica: "rijeci", grupa: novaGrupa() }, kljuc, [
    DB().prepare(
      `INSERT INTO rijeci (rijec, slug, izvor, vrsta) VALUES (?, ?, 'admin', 'znak')
       ON CONFLICT(rijec) DO UPDATE SET aktivna = 1`,
    ).bind(z, slugZnaka(z)),
  ]));
  const r = await DB().prepare(kljuc.sql).bind(z).first<{ id: number }>();
  return r ? { id: r.id } : { greska: "Znak nije upisan." };
}

/**
 * Skrivanje i vraćanje. Skriven znak se ne nudi u editoru, ali zadaci koji ga već imaju i dalje ga
 * prikazuju (kao obrisana riječ), pa se ne briše.
 */
export async function postaviAktivan(id: number, aktivan: boolean, tko: string) {
  await DB().batch(sZapisom({ tko, radnja: aktivan ? "znak.vracen" : "znak.skriven", tablica: "rijeci", grupa: novaGrupa() }, id, [
    DB().prepare("UPDATE rijeci SET aktivna = ? WHERE id = ? AND vrsta = 'znak'").bind(aktivan ? 1 : 0, id),
  ]));
}
