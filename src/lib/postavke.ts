// Postavke iz /admin/prompt (migracija 0012). Svaka izmjena ide i u postavke_povijest.
import { env } from "cloudflare:workers";

export type KljucPostavke = "sistemski_prompt" | "red_pauza" | "zvuk_glas" | "zvuk_model";
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
export async function postaviPredlozak(kod: string, predlozak: string, tko: string, verzijaId?: number) {
  await env.DB.batch([
    env.DB.prepare("UPDATE stilovi SET predlozak = ?, predlozak_verzija = COALESCE(?, predlozak_verzija) WHERE kod = ?")
      .bind(predlozak, verzijaId ?? null, kod),
    env.DB.prepare("INSERT INTO postavke_povijest (kljuc, vrijednost, izmijenio) VALUES (?, ?, ?)").bind(`predlozak:${kod}`, predlozak, tko),
  ]);
}

// ── Verzije promptova (migracija 0013, docs/prompt-iteracije.md) ──────────────────────────────
// Ključ verzije: 'sistemski_prompt' ili 'predlozak:<kod>'. Verzija se nikad ne mijenja ni briše;
// „spremi” s novim tekstom stvara novu, „aktiviraj” samo prebaci aktivnu.

export interface Verzija {
  id: number; kljuc: string; broj: number; tekst: string; biljeska: string | null; autor: string | null; created_at: string;
  poslova: number; odobreno: number; odbijeno: number; kandidata: number;
}

/** Verzije ključa, najnovija prva, s brojem slika po statusu (preko poslova koji su ih stvorili). */
export async function verzije(kljuc: string): Promise<Verzija[]> {
  const stupac = kljuc === "sistemski_prompt" ? "sistemski_verzija" : "predlozak_verzija";
  const { results } = await env.DB.prepare(
    `SELECT v.id, v.kljuc, v.broj, v.tekst, v.biljeska, v.autor, v.created_at,
       COUNT(g.id) AS poslova,
       COALESCE(SUM(s.status = 'odobrena'), 0) AS odobreno,
       COALESCE(SUM(s.status = 'odbijena'), 0) AS odbijeno,
       COALESCE(SUM(s.status = 'kandidat'), 0) AS kandidata
     FROM prompt_verzije v
     LEFT JOIN generiranja g ON g.${stupac} = v.id AND g.status = 'gotovo'
     LEFT JOIN slike s ON s.id = g.slika_id
     WHERE v.kljuc = ? GROUP BY v.id ORDER BY v.broj DESC`,
  ).bind(kljuc).all<Verzija>();
  return results;
}

/** Postojeća verzija s istim tekstom ili nova (sljedeći broj). Vraća id. */
export async function verzijaZaTekst(kljuc: string, tekst: string, tko: string, biljeska?: string): Promise<number> {
  const ista = await env.DB.prepare("SELECT id FROM prompt_verzije WHERE kljuc = ? AND tekst = ? ORDER BY broj DESC LIMIT 1")
    .bind(kljuc, tekst).first<{ id: number }>();
  if (ista) return ista.id;
  const r = await env.DB.prepare(
    `INSERT INTO prompt_verzije (kljuc, broj, tekst, biljeska, autor)
     VALUES (?1, (SELECT COALESCE(MAX(broj), 0) + 1 FROM prompt_verzije WHERE kljuc = ?1), ?2, ?3, ?4) RETURNING id`,
  ).bind(kljuc, tekst, biljeska?.trim() || null, tko).first<{ id: number }>();
  return r!.id;
}

/** Sistemski prompt: spremi kao verziju (novu ili postojeću s istim tekstom) i aktiviraj je. */
export async function postaviSistemski(tekst: string, tko: string, biljeska?: string) {
  const id = await verzijaZaTekst("sistemski_prompt", tekst, tko, biljeska);
  await postavi("sistemski_prompt", tekst, tko);
  await env.DB.prepare("UPDATE postavke SET verzija_id = ? WHERE kljuc = 'sistemski_prompt'").bind(id).run();
}

/** Jedan klik: verzija postaje aktivna (sistemski prompt ili predložak svog stila). */
export async function aktivirajVerziju(id: number, tko: string): Promise<boolean> {
  const v = await env.DB.prepare("SELECT kljuc, tekst FROM prompt_verzije WHERE id = ?").bind(id).first<{ kljuc: string; tekst: string }>();
  if (!v) return false;
  if (v.kljuc === "sistemski_prompt") {
    await postavi("sistemski_prompt", v.tekst, tko);
    await env.DB.prepare("UPDATE postavke SET verzija_id = ? WHERE kljuc = 'sistemski_prompt'").bind(id).run();
  } else if (v.kljuc.startsWith("predlozak:")) {
    await postaviPredlozak(v.kljuc.slice("predlozak:".length), v.tekst, tko, id);
  } else return false;
  return true;
}

export async function aktivnaSistemska(): Promise<number | null> {
  return (await env.DB.prepare("SELECT verzija_id FROM postavke WHERE kljuc = 'sistemski_prompt'").first<{ verzija_id: number | null }>())?.verzija_id ?? null;
}

export const redPauziran = async () => (await postavka("red_pauza")) === "1";

export interface Izmjena { id: number; kljuc: string; vrijednost: string; izmijenio: string | null; created_at: string }
export async function povijest(limit = 20): Promise<Izmjena[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, kljuc, vrijednost, izmijenio, created_at FROM postavke_povijest ORDER BY id DESC LIMIT ?",
  ).bind(limit).all<Izmjena>();
  return results;
}
