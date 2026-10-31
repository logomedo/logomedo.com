// Red generiranja slika. Admin dodaje poslove, lokalni runner (scripts/runner.sh)
// ih uzima preko /api/runner/* i vraća sliku. agy radi samo na Macu, pa Worker
// ne generira ništa sam.
import { env } from "cloudflare:workers";
import type { Stil } from "./katalog";

const ZASTARIO_MIN = 15;
const MAX_POKUSAJA = 3;

/** Prompt iz predloška stila. Razlozi odbijenih slika te riječi ulaze kao napomena. */
export function sloziPrompt(stil: Stil, r: { rijec: string; opis_za_sliku: string | null }, razlozi: string[], napomena?: string) {
  const dodatak = [
    napomena?.trim(),
    ...razlozi.map((x) => `Avoid: ${x}`),
  ].filter(Boolean).join(" ");
  return stil.predlozak
    .replaceAll("{rijec}", r.rijec.toLocaleUpperCase("hr"))
    .replaceAll("{opis}", r.opis_za_sliku?.trim() || "the most common everyday meaning")
    .replaceAll("{napomena}", dodatak)
    .trim();
}

/** Dodaje posao za svaku riječ koja ga već nema u redu. Vraća broj dodanih. */
export async function dodajURed(stil: Stil, rijecIds: number[], email: string, napomena?: string): Promise<number> {
  if (!rijecIds.length) return 0;
  const db = env.DB;
  let dodano = 0;
  for (let i = 0; i < rijecIds.length; i += 50) {
    const dio = rijecIds.slice(i, i + 50);
    const mjesta = dio.map(() => "?").join(",");
    const { results: rijeci } = await db.prepare(
      `SELECT r.id, r.rijec, r.opis_za_sliku,
         (SELECT json_group_array(s.razlog) FROM slike s WHERE s.rijec_id = r.id AND s.stil_id = ? AND s.status = 'odbijena' AND s.razlog IS NOT NULL) AS razlozi
       FROM rijeci r WHERE r.id IN (${mjesta})
         AND NOT EXISTS (SELECT 1 FROM generiranja q WHERE q.rijec_id = r.id AND q.stil_id = ? AND q.status IN ('ceka','radi'))`,
    ).bind(stil.id, ...dio, stil.id).all<{ id: number; rijec: string; opis_za_sliku: string | null; razlozi: string }>();
    if (!rijeci.length) continue;
    await db.batch(rijeci.map((r) =>
      db.prepare("INSERT INTO generiranja (rijec_id, stil_id, prompt, zatrazio) VALUES (?, ?, ?, ?)")
        .bind(r.id, stil.id, sloziPrompt(stil, r, JSON.parse(r.razlozi ?? "[]").slice(-3), napomena), email),
    ));
    dodano += rijeci.length;
  }
  return dodano;
}

export interface Posao { id: number; prompt: string; rijec: string; slug: string; stil: string; pokusaji: number }

/** Uzima najstariji posao. Zaglavljeni ('radi' > 15 min) prvo se vraćaju u red. */
export async function uzmi(): Promise<Posao | null> {
  const db = env.DB;
  await db.prepare(
    `UPDATE generiranja SET status = 'ceka' WHERE status = 'radi' AND uzeto_at < datetime('now', '-${ZASTARIO_MIN} minutes')`,
  ).run();
  const p = await db.prepare(
    `UPDATE generiranja SET status = 'radi', uzeto_at = datetime('now'), pokusaji = pokusaji + 1
     WHERE id = (SELECT id FROM generiranja WHERE status = 'ceka' ORDER BY id LIMIT 1) AND status = 'ceka'
     RETURNING id, rijec_id, stil_id, prompt, pokusaji`,
  ).first<{ id: number; rijec_id: number; stil_id: number; prompt: string; pokusaji: number }>();
  if (!p) return null;
  const r = await db.prepare(
    "SELECT r.rijec, r.slug, s.kod AS stil FROM rijeci r, stilovi s WHERE r.id = ? AND s.id = ?",
  ).bind(p.rijec_id, p.stil_id).first<{ rijec: string; slug: string; stil: string }>();
  return { id: p.id, prompt: p.prompt, pokusaji: p.pokusaji, ...r! };
}

const MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const MAX_BAJTOVA = 8 * 1024 * 1024;

/** Slika od runnera: u R2, u `slike` kao kandidat, posao gotov. */
export async function predaj(posaoId: number, mime: string, tijelo: ArrayBuffer): Promise<{ slikaId: number } | { greska: string }> {
  const ext = MIME[mime];
  if (!ext) return { greska: `nepodržan tip ${mime}` };
  if (tijelo.byteLength === 0 || tijelo.byteLength > MAX_BAJTOVA) return { greska: "prazna ili prevelika slika" };
  const db = env.DB;
  const p = await db.prepare(
    `SELECT q.id, q.rijec_id, q.stil_id, q.prompt, r.slug, s.kod, s.model FROM generiranja q
     JOIN rijeci r ON r.id = q.rijec_id JOIN stilovi s ON s.id = q.stil_id WHERE q.id = ? AND q.status = 'radi'`,
  ).bind(posaoId).first<{ id: number; rijec_id: number; stil_id: number; prompt: string; slug: string; kod: string; model: string }>();
  if (!p) return { greska: "posao ne postoji ili nije u radu" };

  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", tijelo))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const kljuc = `${p.kod}/${p.slug}/${hash.slice(0, 16)}.${ext}`;
  await env.SLIKE.put(kljuc, tijelo, { httpMetadata: { contentType: mime } });
  const s = await db.prepare(
    `INSERT INTO slike (rijec_id, stil_id, r2_kljuc, sha256, mime, bajtova, prompt, model, izvor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agy') RETURNING id`,
  ).bind(p.rijec_id, p.stil_id, kljuc, hash, mime, tijelo.byteLength, p.prompt, p.model).first<{ id: number }>();
  await db.prepare("UPDATE generiranja SET status = 'gotovo', zavrseno_at = datetime('now'), slika_id = ?, greska = NULL WHERE id = ?")
    .bind(s!.id, p.id).run();
  return { slikaId: s!.id };
}

/** Neuspjeh: natrag u red dok ne prijeđe MAX_POKUSAJA, onda 'greska'. */
export async function neuspjeh(posaoId: number, greska: string) {
  await env.DB.prepare(
    `UPDATE generiranja SET greska = ?, status = CASE WHEN pokusaji >= ${MAX_POKUSAJA} THEN 'greska' ELSE 'ceka' END
     WHERE id = ? AND status = 'radi'`,
  ).bind(greska.slice(0, 500), posaoId).run();
}

/** Odluka o kandidatu. Odobrena istiskuje dosadašnju odobrenu (ona postaje kandidat). */
export async function odluci(slikaId: number, akcija: "odobri" | "odbij" | "vrati", email: string, razlog?: string) {
  const db = env.DB;
  const s = await db.prepare("SELECT id, rijec_id, stil_id FROM slike WHERE id = ?").bind(slikaId).first<{ id: number; rijec_id: number; stil_id: number }>();
  if (!s) return false;
  if (akcija === "odobri") {
    await db.batch([
      db.prepare("UPDATE slike SET status = 'kandidat' WHERE rijec_id = ? AND stil_id = ? AND status = 'odobrena'").bind(s.rijec_id, s.stil_id),
      db.prepare("UPDATE slike SET status = 'odobrena', razlog = NULL, pregledao = ?, pregledano_at = datetime('now') WHERE id = ?").bind(email, s.id),
    ]);
  } else if (akcija === "odbij") {
    await db.prepare("UPDATE slike SET status = 'odbijena', razlog = ?, pregledao = ?, pregledano_at = datetime('now') WHERE id = ?")
      .bind(razlog?.trim().slice(0, 300) || null, email, s.id).run();
  } else {
    await db.prepare("UPDATE slike SET status = 'kandidat', pregledao = ?, pregledano_at = datetime('now') WHERE id = ?").bind(email, s.id).run();
  }
  return true;
}
