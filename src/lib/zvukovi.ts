// Izgovor kroz ElevenLabs (docs/zvukovi.md): red u D1 + Cloudflare Queue, Worker sam zove
// TTS, Scribe STT provjeri snimku, ljudski pregled na /admin/zvukovi, odobrena ide na CDN.
import { env } from "cloudflare:workers";
import { GreskaElevenLabs, izgovori, prepisi } from "./elevenlabs";
import { postavka } from "./postavke";
import { ekrani, uputaZa, type ZadatakZaIgru } from "./biljeznice-ekrani";
import { UPUTE_PRVOG_GLASA } from "./zadaci/vrste";
import { izgovorZa, kljucZvuka, prolazi, slicnost } from "./zvukovi-tekst";
import { javniUrl, ocistiCache } from "./generiranje";

/** TTS poziva po poslu: STT razlika = još jedan pokušaj, zadnji ide čovjeku s oznakom „razlika”. */
export const MAX_POKUSAJA = 3;
const ZASTARIO_MIN = 10;

export interface PorukaZvuka { posao: number }

// ── Tekstovi koje bilježnica izgovara ────────────────────────────────────────────────────────

/** Isti tekstovi koje igra predaje `govori()`: riječi, upute (s riječju) i kraj. Ključevi, bez ponavljanja. */
export function tekstoviIgre(zadaci: ZadatakZaIgru[], rijeci: { id: number; rijec: string }[], kraj: string): string[] {
  const ime = new Map(rijeci.map((r) => [r.id, r.rijec]));
  const t = new Set<string>();
  for (const e of ekrani(zadaci)) {
    if (e.vrsta === "prvi_glas") {
      // Isto što igra izgovara: poziv na kolo, slovo na kojem stane i pitanje sa slovom.
      t.add(kljucZvuka(UPUTE_PRVOG_GLASA.kolo));
      t.add(kljucZvuka(`Glas ${e.krug.slovo}!`));
      t.add(kljucZvuka(e.uputa.replaceAll("{slovo}", e.krug.slovo!)));
      continue;
    }
    t.add(kljucZvuka(uputaZa(e.uputa, e.vrsta === "odabir" ? ime.get(e.stavka.zadana!) ?? null : null)));
  }
  for (const r of rijeci) t.add(kljucZvuka(r.rijec));
  t.add(kljucZvuka(kraj));
  t.delete("");
  return [...t];
}

/** Odobrene snimke za ključeve: { ključ: javni URL }. Za javnu igru. */
export async function odobreniZvukovi(kljucevi: string[]): Promise<Record<string, string>> {
  if (!kljucevi.length) return {};
  const { results } = await env.DB.prepare(
    `SELECT kljuc, r2_kljuc FROM zvukovi WHERE status = 'odobren' AND kljuc IN (SELECT value FROM json_each(?)) ORDER BY id`,
  ).bind(JSON.stringify(kljucevi)).all<{ kljuc: string; r2_kljuc: string }>();
  return Object.fromEntries(results.map((r) => [r.kljuc, javniUrl(r.r2_kljuc)]));
}

export interface StanjeZvuka { kljuc: string; odobren: number | null; kandidata: number; u_redu: number; greska: string | null; bez_ponavljanja: number }

export async function stanjeZvukova(kljucevi: string[]): Promise<StanjeZvuka[]> {
  if (!kljucevi.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT k.value AS kljuc,
       (SELECT z.id FROM zvukovi z WHERE z.kljuc = k.value AND z.status = 'odobren' ORDER BY z.id DESC LIMIT 1) AS odobren,
       (SELECT COUNT(*) FROM zvukovi z WHERE z.kljuc = k.value AND z.status = 'kandidat') AS kandidata,
       (SELECT COUNT(*) FROM zvuk_generiranja q WHERE q.kljuc = k.value AND q.status IN ('ceka', 'radi')) AS u_redu,
       (SELECT q.greska FROM zvuk_generiranja q WHERE q.kljuc = k.value AND q.status = 'greska' ORDER BY q.id DESC LIMIT 1) AS greska,
       COALESCE((SELECT z.bez_ponavljanja FROM zvukovi z WHERE z.kljuc = k.value ORDER BY z.id DESC LIMIT 1), 0) AS bez_ponavljanja
     FROM json_each(?) k`,
  ).bind(JSON.stringify(kljucevi)).all<StanjeZvuka>();
  return results;
}

// ── Red ──────────────────────────────────────────────────────────────────────────────────────

/** Posao za svaki ključ bez odobrene snimke, kandidata, posla u redu i „samo odbij”. Vraća broj dodanih. */
export async function dodajZvukove(kljucevi: string[], email: string): Promise<number> {
  const trebaju = (await stanjeZvukova(kljucevi.map(kljucZvuka))).filter((s) => !s.odobren && !s.kandidata && !s.u_redu && !s.bez_ponavljanja);
  const ids: number[] = [];
  for (const s of trebaju) ids.push(await novPosao(s.kljuc, izgovorZa(s.kljuc), email));
  await posalji(ids);
  return ids.length;
}

async function novPosao(kljuc: string, izgovor: string, email: string): Promise<number> {
  const r = await env.DB.prepare("INSERT INTO zvuk_generiranja (kljuc, izgovor, zatrazio) VALUES (?, ?, ?) RETURNING id")
    .bind(kljuc, izgovor, email).first<{ id: number }>();
  return r!.id;
}

async function posalji(ids: number[]) {
  for (let i = 0; i < ids.length; i += 100) {
    await env.ZVUKOVI_RED.sendBatch(ids.slice(i, i + 100).map((posao) => ({ body: { posao } satisfies PorukaZvuka })));
  }
}

/** Poslovi koji čekaju (poruka izgubljena) ili su zapeli u „radi”: ponovno u Queue. */
export async function posaljiZaglavljene(): Promise<number> {
  await env.DB.prepare(
    `UPDATE zvuk_generiranja SET status = 'ceka' WHERE status = 'radi' AND uzeto_at < datetime('now', '-${ZASTARIO_MIN} minutes')`,
  ).run();
  const { results } = await env.DB.prepare("SELECT id FROM zvuk_generiranja WHERE status = 'ceka'").all<{ id: number }>();
  await posalji(results.map((r) => r.id));
  return results.length;
}

export async function greskeURed(): Promise<number> {
  const { results } = await env.DB.prepare(
    "UPDATE zvuk_generiranja SET status = 'ceka', pokusaji = 0, greska = NULL WHERE status = 'greska' RETURNING id",
  ).all<{ id: number }>();
  await posalji(results.map((r) => r.id));
  return results.length;
}

async function hash16(b: ArrayBuffer) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", b));
  return [...h.slice(0, 8)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Jedan posao iz Queuea. Baca `GreskaElevenLabs` s `privremena` (429, 5xx): consumer tada
 * vraća poruku u Queue s odgodom, a posao natrag na „čeka”.
 */
export async function obradi(posaoId: number): Promise<void> {
  const db = env.DB;
  const p = await db.prepare(
    `UPDATE zvuk_generiranja SET status = 'radi', uzeto_at = datetime('now') WHERE id = ? AND status = 'ceka'
     RETURNING id, kljuc, izgovor, pokusaji`,
  ).bind(posaoId).first<{ id: number; kljuc: string; izgovor: string; pokusaji: number }>();
  if (!p) return;   // već obrađen ili obrisan

  const glas = (await postavka("zvuk_glas")).trim();
  const model = (await postavka("zvuk_model")).trim() || "eleven_v3";
  if (!glas) {
    await db.prepare("UPDATE zvuk_generiranja SET status = 'greska', greska = ? WHERE id = ?")
      .bind("Nije odabran glas (/admin/zvukovi → Glas).", p.id).run();
    return;
  }

  let pokusaji = p.pokusaji;
  try {
    const nastali: { id: number; s: number }[] = [];
    while (pokusaji < MAX_POKUSAJA) {
      const mp3 = await izgovori(p.izgovor, glas, model);
      pokusaji++;
      await db.prepare("UPDATE zvuk_generiranja SET pokusaji = ? WHERE id = ?").bind(pokusaji, p.id).run();
      let prijepis: string | null = null;
      try { prijepis = await prepisi(mp3); } catch (e) { console.error(`STT posao ${p.id}: ${e}`); }
      const s = prijepis === null ? null : slicnost(p.kljuc, prijepis);
      const ok = prijepis === null || prolazi(p.kljuc, prijepis);
      const r2 = `zvuk/${await hash16(mp3)}.mp3`;
      await env.SLIKE.put(r2, mp3, { httpMetadata: { contentType: "audio/mpeg" } });
      const z = await db.prepare(
        `INSERT INTO zvukovi (kljuc, izgovor, r2_kljuc, bajtova, glas_id, model, prijepis, slicnost, provjera, status, razlog, pregledao, pregledano_at, posao_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      ).bind(
        p.kljuc, p.izgovor, r2, mp3.byteLength, glas, model, prijepis, s,
        prijepis === null ? "bez" : ok ? "ok" : "razlika",
        ok ? "kandidat" : "odbijen",
        ok ? null : `Automatska provjera: čuje se „${prijepis}”`,
        ok ? null : "automatski", ok ? null : new Date().toISOString().slice(0, 19).replace("T", " "),
        p.id,
      ).first<{ id: number }>();
      if (ok) return zavrsi(p.id, z!.id);
      nastali.push({ id: z!.id, s: s ?? 0 });
    }
    // Nijedan pokušaj nije prošao provjeru: najbolji ide čovjeku (oznaka „razlika” ostaje).
    const naj = nastali.sort((a, b) => b.s - a.s)[0];
    if (naj) {
      await db.prepare("UPDATE zvukovi SET status = 'kandidat', pregledao = NULL, pregledano_at = NULL WHERE id = ?").bind(naj.id).run();
      return zavrsi(p.id, naj.id);
    }
    await db.prepare("UPDATE zvuk_generiranja SET status = 'greska', greska = 'iscrpljeni pokušaji' WHERE id = ?").bind(p.id).run();
  } catch (e) {
    const privremena = e instanceof GreskaElevenLabs && e.privremena;
    await db.prepare("UPDATE zvuk_generiranja SET status = ?, greska = ?, uzeto_at = NULL WHERE id = ?")
      .bind(privremena ? "ceka" : "greska", String(e instanceof Error ? e.message : e).slice(0, 500), p.id).run();
    if (privremena) throw e;
  }
}

async function zavrsi(posaoId: number, zvukId: number) {
  await env.DB.prepare("UPDATE zvuk_generiranja SET status = 'gotovo', zvuk_id = ?, greska = NULL, zavrseno_at = datetime('now') WHERE id = ?")
    .bind(zvukId, posaoId).run();
}

// ── Pregled ──────────────────────────────────────────────────────────────────────────────────

export interface Zvuk {
  id: number; kljuc: string; izgovor: string; status: string; provjera: string; prijepis: string | null; slicnost: number | null;
  razlog: string | null; bez_ponavljanja: number; pregledao: string | null; model: string; glas_id: string; created_at: string;
}

export async function zvukoviZaPregled(status: "kandidat" | "odobren" | "odbijen", limit = 200): Promise<Zvuk[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, kljuc, izgovor, status, provjera, prijepis, slicnost, razlog, bez_ponavljanja, pregledao, model, glas_id, created_at
     FROM zvukovi WHERE status = ? ORDER BY ${status === "kandidat" ? "provjera = 'ok', id" : "id DESC"} LIMIT ?`,
  ).bind(status, limit).all<Zvuk>();
  return results;
}

/**
 * Odobri: snimka ide na CDN, prijašnja odobrena za isti tekst postaje odbijena („zamijenjena”).
 * Odbij: s razlogom; ako tekst više nema ni kandidata ni odobrene, novi posao (s ispravljenim
 * izgovorom, ako ga je recenzent upisao). `ponovo: false` = samo odbij, bez novog posla (ElevenLabs
 * neke riječi ne zna izgovoriti; tekst se kasnije može vratiti „Generiraj ponovno” na tabu Odbijeni).
 * Vraća false ako snimka više nije kandidat.
 */
export async function odluciZvuk(id: number, akcija: "odobri" | "odbij", email: string, o: { razlog?: string; izgovor?: string; ponovo?: boolean } = {}): Promise<boolean> {
  const db = env.DB;
  const z = await db.prepare("SELECT id, kljuc, izgovor, status FROM zvukovi WHERE id = ?").bind(id)
    .first<{ id: number; kljuc: string; izgovor: string; status: string }>();
  if (!z || z.status !== "kandidat") return false;
  if (akcija === "odobri") {
    const { results: stari } = await db.prepare("SELECT id, r2_kljuc FROM zvukovi WHERE kljuc = ? AND status = 'odobren'").bind(z.kljuc).all<{ id: number; r2_kljuc: string }>();
    await db.batch([
      db.prepare("UPDATE zvukovi SET status = 'odbijen', razlog = 'zamijenjen novijom', pregledao = ?, pregledano_at = datetime('now') WHERE kljuc = ? AND status = 'odobren'").bind(email, z.kljuc),
      db.prepare("UPDATE zvukovi SET status = 'odobren', razlog = NULL, pregledao = ?, pregledano_at = datetime('now') WHERE id = ?").bind(email, id),
    ]);
    await uskladiJavniZvuk(id);
    for (const s of stari) await makniJavni(s.r2_kljuc);
    return true;
  }
  await db.prepare("UPDATE zvukovi SET status = 'odbijen', razlog = ?, bez_ponavljanja = ?, pregledao = ?, pregledano_at = datetime('now') WHERE id = ? AND status = 'kandidat'")
    .bind(o.razlog?.trim() || null, o.ponovo === false ? 1 : 0, email, id).run();
  if (o.ponovo === false) return true;
  const [s] = await stanjeZvukova([z.kljuc]);
  if (!s.odobren && !s.kandidata && !s.u_redu) {
    const pid = await novPosao(z.kljuc, o.izgovor?.trim() || z.izgovor, email);
    await posalji([pid]);
  }
  return true;
}

/** Odobreni tekst ponovno: novi posao (npr. nakon promjene glasa). Stara odobrena ostaje dok nova ne bude odobrena. */
export async function ponoviZvuk(kljuc: string, email: string, izgovor?: string): Promise<boolean> {
  const [s] = await stanjeZvukova([kljuc]);
  if (s.u_redu || s.kandidata) return false;
  await posalji([await novPosao(kljuc, izgovor?.trim() || izgovorZa(kljuc), email)]);
  return true;
}

async function uskladiJavniZvuk(id: number) {
  const z = await env.DB.prepare("SELECT r2_kljuc, mime FROM zvukovi WHERE id = ?").bind(id).first<{ r2_kljuc: string; mime: string }>();
  if (!z || (await env.JAVNO.head(z.r2_kljuc))) return;
  const o = await env.SLIKE.get(z.r2_kljuc);
  if (!o) throw new Error(`nema ${z.r2_kljuc} u privatnom bucketu`);
  await env.JAVNO.put(z.r2_kljuc, o.body, { httpMetadata: { contentType: z.mime, cacheControl: "public, max-age=31536000, immutable" } });
}

async function makniJavni(r2: string) {
  // Isti sadržaj može imati više redaka (isti hash): makni samo ako nijedan nije odobren.
  const jos = await env.DB.prepare("SELECT 1 FROM zvukovi WHERE r2_kljuc = ? AND status = 'odobren'").bind(r2).first();
  if (jos || !(await env.JAVNO.head(r2))) return;
  await env.JAVNO.delete(r2);
  await ocistiCache(javniUrl(r2));
}
