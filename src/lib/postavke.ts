// Postavke iz /admin/prompt (migracija 0012). Svaka izmjena ide i u postavke_povijest.
import { env } from "cloudflare:workers";

export type KljucPostavke = "sistemski_prompt" | "red_pauza";
export const MAX_PROMPT = 4000;

export async function postavka(kljuc: KljucPostavke): Promise<string> {
  const r = await env.DB.prepare("SELECT vrijednost FROM postavke WHERE kljuc = ?").bind(kljuc).first<{ vrijednost: string }>();
  return r?.vrijednost ?? "";
}

export async function postavi(kljuc: KljucPostavke, vrijednost: string, tko: string) {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO postavke (kljuc, vrijednost, izmijenio, izmijenjeno_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT (kljuc) DO UPDATE SET vrijednost = excluded.vrijednost, izmijenio = excluded.izmijenio, izmijenjeno_at = excluded.izmijenjeno_at`,
    ).bind(kljuc, vrijednost, tko),
    env.DB.prepare("INSERT INTO postavke_povijest (kljuc, vrijednost, izmijenio) VALUES (?, ?, ?)").bind(kljuc, vrijednost, tko),
  ]);
}

/** Predložak stila; vrijedi za poslove dodane nakon izmjene (prompt posla se slaže pri dodavanju). */
export async function postaviPredlozak(kod: string, predlozak: string, tko: string) {
  await env.DB.batch([
    env.DB.prepare("UPDATE stilovi SET predlozak = ? WHERE kod = ?").bind(predlozak, kod),
    env.DB.prepare("INSERT INTO postavke_povijest (kljuc, vrijednost, izmijenio) VALUES (?, ?, ?)").bind(`predlozak:${kod}`, predlozak, tko),
  ]);
}

export const redPauziran = async () => (await postavka("red_pauza")) === "1";

export interface Izmjena { id: number; kljuc: string; vrijednost: string; izmijenio: string | null; created_at: string }
export async function povijest(limit = 20): Promise<Izmjena[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, kljuc, vrijednost, izmijenio, created_at FROM postavke_povijest ORDER BY id DESC LIMIT ?",
  ).bind(limit).all<Izmjena>();
  return results;
}
