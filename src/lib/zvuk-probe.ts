// Probe glasova (/admin/zvukovi/glasovi, docs/zvukovi.md „Izbor glasa”): glas × način × tekst,
// trajno u D1 (zvuk_probe) i R2, s ljudskom ocjenom i napomenom. Rang glasova slaže se iz ocjena
// proba, ocjene cijelog glasa, STT provjere i odluka na /admin/zvukovi.
import { env } from "cloudflare:workers";
import { prepisi, snimi } from "./elevenlabs";
import { postavka } from "./postavke";
import { prolazi, slicnost, TEST_SKUP } from "./zvukovi-tekst";

export interface Proba {
  id: number; glas_id: string; nacin: string; tekst: string; prijepis: string | null; slicnost: number | null;
  ocjena: number | null; napomena: string | null; ocijenio: string | null;
}
const STUPCI = "id, glas_id, nacin, tekst, prijepis, slicnost, ocjena, napomena, ocijenio";

export async function testSkup(): Promise<string[]> {
  const t = (await postavka("zvuk_test_skup")).split("\n").map((r) => r.trim()).filter(Boolean);
  return t.length ? t : TEST_SKUP;
}

/** Postojeća proba ili nova (TTS + STT), spremljena trajno. */
export async function proba(glasId: string, glasIme: string | null, nacin: string, tekst: string): Promise<Proba & { nova: boolean }> {
  const db = env.DB;
  const ima = await db.prepare(`SELECT ${STUPCI} FROM zvuk_probe WHERE glas_id = ? AND nacin = ? AND tekst = ?`).bind(glasId, nacin, tekst).first<Proba>();
  if (ima) return { ...ima, nova: false };
  const mp3 = await snimi(tekst, glasId, nacin);
  const prijepis = await prepisi(mp3).catch(() => null);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", mp3));
  const r2 = `proba/${[...h.slice(0, 8)].map((x) => x.toString(16).padStart(2, "0")).join("")}.mp3`;
  await env.SLIKE.put(r2, mp3, { httpMetadata: { contentType: "audio/mpeg" } });
  const p = await db.prepare(
    `INSERT INTO zvuk_probe (glas_id, glas_ime, nacin, tekst, r2_kljuc, prijepis, slicnost) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (glas_id, nacin, tekst) DO UPDATE SET glas_ime = excluded.glas_ime RETURNING ${STUPCI}`,
  ).bind(glasId, glasIme, nacin, tekst, r2, prijepis, prijepis === null ? null : slicnost(tekst, prijepis)).first<Proba>();
  return { ...p!, nova: true };
}

export const probaTocna = (p: Pick<Proba, "tekst" | "prijepis">) => p.prijepis !== null && prolazi(p.tekst, p.prijepis);

export async function ocijeniProbu(id: number, ocjena: number | null, napomena: string | null, tko: string) {
  await env.DB.prepare("UPDATE zvuk_probe SET ocjena = ?, napomena = ?, ocijenio = ?, ocijenjeno_at = datetime('now') WHERE id = ?")
    .bind(ocjena, napomena?.trim() || null, tko, id).run();
}

export async function obrisiProbu(id: number) {
  await env.DB.prepare("DELETE FROM zvuk_probe WHERE id = ?").bind(id).run();
}

export async function ocijeniGlas(glasId: string, glasIme: string | null, ocjena: number | null, napomena: string | null, tko: string) {
  await env.DB.prepare(
    `INSERT INTO zvuk_glas_biljeske (glas_id, glas_ime, ocjena, napomena, izmijenio) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (glas_id) DO UPDATE SET glas_ime = excluded.glas_ime, ocjena = excluded.ocjena, napomena = excluded.napomena,
       izmijenio = excluded.izmijenio, izmijenjeno_at = datetime('now')`,
  ).bind(glasId, glasIme, ocjena, napomena?.trim() || null, tko).run();
}

export interface BiljeskaGlasa { glas_id: string; ocjena: number | null; napomena: string | null; izmijenio: string | null; izmijenjeno_at: string }
export interface PregledGlasa { glas_id: string; nacin: string; odobreno: number; odbijeno: number; automatski: number }

/** Sve što treba stranici: probe za način, bilješke glasova i odluke iz pregleda po glasu i načinu. */
export async function podaciProba(nacin: string) {
  const db = env.DB;
  const [probe, biljeske, pregled] = await db.batch([
    db.prepare(`SELECT ${STUPCI} FROM zvuk_probe WHERE nacin = ? ORDER BY id`).bind(nacin),
    db.prepare("SELECT glas_id, ocjena, napomena, izmijenio, izmijenjeno_at FROM zvuk_glas_biljeske"),
    // Ljudsko odbijanje bez zamjene i izbora druge snimke = stvarno loša snimka.
    db.prepare(
      `SELECT glas_id, COALESCE(nacin, model) AS nacin, SUM(status = 'odobren') AS odobreno,
         SUM(status = 'odbijen' AND pregledao != 'automatski' AND COALESCE(razlog, '') NOT IN ('zamijenjen novijom', 'odabrana druga snimka')) AS odbijeno,
         SUM(pregledao = 'automatski') AS automatski
       FROM zvukovi GROUP BY 1, 2`,
    ),
  ]) as [D1Result<Proba>, D1Result<BiljeskaGlasa>, D1Result<PregledGlasa>];
  return { probe: probe.results, biljeske: biljeske.results, pregled: pregled.results };
}

/** Bodovi za rang: ljudske ocjene vrijede više od STT-a; ocjena cijelog glasa najviše. */
export function bodovi(o: { dobrih: number; losih: number; tocnih: number; snimljenih: number; ocjenaGlasa: number | null; odobreno: number; odbijeno: number }) {
  return 15 * (o.ocjenaGlasa ?? 0) + 2 * (o.dobrih - o.losih) + (o.snimljenih ? (o.tocnih / o.snimljenih) * 5 : 0) + 0.2 * (o.odobreno - 3 * o.odbijeno);
}
