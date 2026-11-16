// Izgovor kroz ElevenLabs (docs/zvukovi.md): red u D1 + Cloudflare Queue, Worker sam zove
// TTS, Scribe STT provjeri snimku, ljudski pregled na /admin/zvukovi, odobrena ide na CDN.
import { env } from "cloudflare:workers";
import { GreskaElevenLabs, prepisi, snimi } from "./elevenlabs";
import { postavka } from "./postavke";
import { ekrani, uputaZa, type ZadatakZaIgru } from "./biljeznice-ekrani";
import { UPUTE_PRVOG_GLASA } from "./zadaci/vrste";
import { izgovorZa, kljucZvuka, naciniZa, prolazi, slicnost } from "./zvukovi-tekst";
import { javniUrl, ocistiCache } from "./generiranje";
import { batchSKvotom, type Kolicina } from "./kvota";

/** TTS poziva po poslu: STT razlika = još jedan pokušaj, zadnji ide čovjeku s oznakom „razlika”. */
export const MAX_POKUSAJA = 3;
const ZASTARIO_MIN = 10;

export interface PorukaZvuka { posao: number }

// ── Tekstovi koje bilježnica izgovara ────────────────────────────────────────────────────────

/** Isti tekstovi koje igra predaje `govori()`: riječi, upute (s riječju) i kraj. Ključevi, bez ponavljanja. */
export function tekstoviIgre(zadaci: ZadatakZaIgru[], rijeci: { id: number; rijec: string; znak?: boolean }[], kraj: string): string[] {
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
    if (e.vrsta === "slogovi" && e.nacin === "duljina") { t.add(kljucZvuka("dugačka riječ")); t.add(kljucZvuka("kratka riječ")); }
    t.add(kljucZvuka(uputaZa(e.uputa, e.vrsta === "odabir" ? ime.get(e.stavka.zadana!) ?? null : null)));
  }
  // Znakovi (slova, brojke) se u igri ne izgovaraju.
  for (const r of rijeci) if (!r.znak) t.add(kljucZvuka(r.rijec));
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

/**
 * Posao za svaki ključ bez odobrene snimke, kandidata, posla u redu i „samo odbij”. Vraća broj dodanih.
 * Jedan batch s kvotom (lib/kvota.ts) za sve; u Queue idu tek nakon uspješnog batcha.
 */
export async function dodajZvukove(kljucevi: string[], email: string): Promise<number> {
  const trebaju = (await stanjeZvukova(kljucevi.map(kljucZvuka))).filter((s) => !s.odobren && !s.kandidata && !s.u_redu && !s.bez_ponavljanja);
  if (!trebaju.length) return 0;
  const ids = await upisiPoslove(email, trebaju.length, trebaju.length === 1 ? `izgovor ${trebaju[0].kljuc}` : `${trebaju.length} izgovora`,
    trebaju.map((s) => novPosao(s.kljuc, izgovorZa(s.kljuc), email)));
  await posalji(ids);
  return ids.length;
}

/** INSERT posla (bezuvjetan, ili uz `uvjet` nad ključem: tada `kolicina` mora brojati isti uvjet). */
function novPosao(kljuc: string, izgovor: string, email: string, varijante = false, uvjet?: { sql: string; args: unknown[] }): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO zvuk_generiranja (kljuc, izgovor, zatrazio, varijante) SELECT ?, ?, ?, ?${uvjet ? ` WHERE ${uvjet.sql}` : ""} RETURNING id`,
  ).bind(kljuc, izgovor, email, varijante ? 1 : 0, ...(uvjet?.args ?? []));
}

/** Batch [kvota, ...upisi]; vraća id-ove upisanih poslova. */
async function upisiPoslove(email: string, kolicina: Kolicina, izvor: string, upisi: D1PreparedStatement[], prije: D1PreparedStatement[] = []): Promise<number[]> {
  const rez = await batchSKvotom(email, "zvukovi", kolicina, izvor, [...prije, ...upisi]);
  return rez.slice(prije.length).flatMap((r) => (r.results as { id: number }[]).map((x) => x.id));
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

/**
 * /admin/zvukovi „Pokušaj ponovo”: neuspjeli poslovi natrag u red (`pokusaji = 0`, novi ElevenLabs
 * pozivi), naplaćeno onome tko klikne, za točno one vraćene.
 */
export async function greskeURed(email: string): Promise<number> {
  const [r] = await batchSKvotom(email, "zvukovi", { sql: "SELECT COUNT(*) FROM zvuk_generiranja WHERE status = 'greska'", args: [] },
    "ponovo neuspjeli izgovori", [
      env.DB.prepare("UPDATE zvuk_generiranja SET status = 'ceka', pokusaji = 0, greska = NULL WHERE status = 'greska' RETURNING id"),
    ]);
  const ids = (r.results as { id: number }[]).map((x) => x.id);
  await posalji(ids);
  return ids.length;
}

async function hash16(b: ArrayBuffer) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", b));
  return [...h.slice(0, 8)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Jedan posao iz Queuea. i-ti pokušaj uzima i-ti način (`naciniZa`): STT razlika = sljedeći način,
 * do 3, a najbolji ide čovjeku s oznakom „razlika”. Posao s `varijante` (nakon ljudskog odbijanja)
 * snimi sve načine i sve pošalje čovjeku, pa on bira. Baca `GreskaElevenLabs` s `privremena`
 * (429, 5xx): consumer tada vraća poruku u Queue s odgodom, a posao natrag na „čeka”.
 */
export async function obradi(posaoId: number): Promise<void> {
  const db = env.DB;
  const p = await db.prepare(
    `UPDATE zvuk_generiranja SET status = 'radi', uzeto_at = datetime('now') WHERE id = ? AND status = 'ceka'
     RETURNING id, kljuc, izgovor, pokusaji, varijante`,
  ).bind(posaoId).first<{ id: number; kljuc: string; izgovor: string; pokusaji: number; varijante: number }>();
  if (!p) return;   // već obrađen ili obrisan

  const glas = (await postavka("zvuk_glas")).trim();
  const model = (await postavka("zvuk_model")).trim() || "eleven_v3";
  if (!glas) {
    await db.prepare("UPDATE zvuk_generiranja SET status = 'greska', greska = ? WHERE id = ?")
      .bind("Nije odabran glas (/admin/zvukovi/glasovi).", p.id).run();
    return;
  }
  const nacini = naciniZa(p.kljuc, model);

  let pokusaji = p.pokusaji;
  try {
    while (pokusaji < Math.min(MAX_POKUSAJA, nacini.length)) {
      const nacin = nacini[pokusaji];
      const mp3 = await snimi(p.izgovor, glas, nacin);
      pokusaji++;
      await db.prepare("UPDATE zvuk_generiranja SET pokusaji = ? WHERE id = ?").bind(pokusaji, p.id).run();
      let prijepis: string | null = null;
      try { prijepis = await prepisi(mp3); } catch (e) { console.error(`STT posao ${p.id}: ${e}`); }
      const s = prijepis === null ? null : slicnost(p.kljuc, prijepis);
      const ok = prijepis === null || prolazi(p.kljuc, prijepis);
      // Varijante idu čovjeku sve; inače STT razlika = automatski odbijeno i sljedeći način.
      const kandidat = ok || p.varijante === 1;
      const r2 = `zvuk/${await hash16(mp3)}.mp3`;
      await env.SLIKE.put(r2, mp3, { httpMetadata: { contentType: "audio/mpeg" } });
      await db.prepare(
        `INSERT INTO zvukovi (kljuc, izgovor, r2_kljuc, bajtova, glas_id, model, nacin, prijepis, slicnost, provjera, status, razlog, pregledao, pregledano_at, posao_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        p.kljuc, p.izgovor, r2, mp3.byteLength, glas, nacin.split("+")[0], nacin, prijepis, s,
        prijepis === null ? "bez" : ok ? "ok" : "razlika",
        kandidat ? "kandidat" : "odbijen",
        kandidat ? null : `Automatska provjera: čuje se „${prijepis}”`,
        kandidat ? null : "automatski", kandidat ? null : new Date().toISOString().slice(0, 19).replace("T", " "),
        p.id,
      ).run();
      if (ok && p.varijante !== 1) break;
    }
    // Najbolja snimka posla: točna, inače najsličnija; ako nijedna nije kandidat, ona postaje.
    const naj = await db.prepare(
      `SELECT id, status FROM zvukovi WHERE posao_id = ? ORDER BY status = 'kandidat' DESC, provjera = 'ok' DESC, slicnost DESC, id LIMIT 1`,
    ).bind(p.id).first<{ id: number; status: string }>();
    if (!naj) {
      await db.prepare("UPDATE zvuk_generiranja SET status = 'greska', greska = 'iscrpljeni pokušaji' WHERE id = ?").bind(p.id).run();
      return;
    }
    if (naj.status !== "kandidat") {
      await db.prepare("UPDATE zvukovi SET status = 'kandidat', pregledao = NULL, pregledano_at = NULL WHERE id = ?").bind(naj.id).run();
    }
    return zavrsi(p.id, naj.id);
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
  razlog: string | null; bez_ponavljanja: number; pregledao: string | null; model: string; nacin: string | null; glas_id: string; created_at: string;
}
const STUPCI = "id, kljuc, izgovor, status, provjera, prijepis, slicnost, razlog, bez_ponavljanja, pregledao, model, nacin, glas_id, created_at";

/** Kartica na /admin/zvukovi: jedan tekst, njegove snimke i je li nova u izradi. */
export interface Skupina { kljuc: string; izgovor: string; snimke: Zvuk[]; uIzradi: boolean; zadnjeOdbijanje: Zvuk | null }
export type TabIzgovora = "ceka" | "odobreno" | "odbijeno" | "greske";

export async function brojeviIzgovora(): Promise<Record<TabIzgovora, number>> {
  const r = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM (SELECT kljuc FROM zvukovi WHERE status = 'kandidat' UNION SELECT kljuc FROM zvuk_generiranja WHERE status IN ('ceka', 'radi'))) AS ceka,
       (SELECT COUNT(*) FROM zvukovi WHERE status = 'odobren') AS odobreno,
       (SELECT COUNT(*) FROM (${ODBIJENI_KLJUCEVI})) AS odbijeno,
       (SELECT COUNT(*) FROM zvuk_generiranja WHERE status = 'greska') AS greske`,
  ).first<Record<TabIzgovora, number>>();
  return r ?? { ceka: 0, odobreno: 0, odbijeno: 0, greske: 0 };
}

// Tekstovi bez odobrene snimke, bez kandidata i bez posla: zadnja snimka je odbijena.
const ODBIJENI_KLJUCEVI = `SELECT kljuc, MAX(id) AS id FROM zvukovi z GROUP BY kljuc
  HAVING SUM(status IN ('odobren', 'kandidat')) = 0
     AND NOT EXISTS (SELECT 1 FROM zvuk_generiranja q WHERE q.kljuc = z.kljuc AND q.status IN ('ceka', 'radi'))`;

/**
 * Kartice za tab. „Čeka”: tekstovi s kandidatima ili poslom u izradi, poredani po prvoj snimci
 * teksta (ne zadnjoj), pa odbijena i ponovno snimljena riječ ostaje na istom mjestu.
 */
export async function skupineIzgovora(tab: TabIzgovora): Promise<Skupina[]> {
  const db = env.DB;
  if (tab === "ceka") {
    const [snimke, poslovi, odbijene, prvi] = await db.batch([
      db.prepare(`SELECT ${STUPCI} FROM zvukovi WHERE status = 'kandidat' ORDER BY id`),
      db.prepare("SELECT kljuc, izgovor FROM zvuk_generiranja WHERE status IN ('ceka', 'radi') ORDER BY id"),
      db.prepare(`SELECT ${STUPCI} FROM zvukovi WHERE id IN (SELECT MAX(id) FROM zvukovi WHERE status = 'odbijen' AND pregledao != 'automatski' GROUP BY kljuc)`),
      db.prepare("SELECT kljuc, MIN(id) AS id FROM zvukovi GROUP BY kljuc"),
    ]) as [D1Result<Zvuk>, D1Result<{ kljuc: string; izgovor: string }>, D1Result<Zvuk>, D1Result<{ kljuc: string; id: number }>];
    const red = new Map(prvi.results.map((r) => [r.kljuc, r.id]));
    const odb = new Map(odbijene.results.map((z) => [z.kljuc, z]));
    const m = new Map<string, Skupina>();
    const skupina = (kljuc: string, izgovor: string) => {
      if (!m.has(kljuc)) m.set(kljuc, { kljuc, izgovor, snimke: [], uIzradi: false, zadnjeOdbijanje: odb.get(kljuc) ?? null });
      return m.get(kljuc)!;
    };
    for (const z of snimke.results) skupina(z.kljuc, z.izgovor).snimke.push(z);
    for (const q of poslovi.results) skupina(q.kljuc, q.izgovor).uIzradi = true;
    // U skupini točna snimka prva.
    for (const s of m.values()) s.snimke.sort((a, b) => Number(b.provjera === "ok") - Number(a.provjera === "ok") || a.id - b.id);
    return [...m.values()].sort((a, b) => (red.get(a.kljuc) ?? Infinity) - (red.get(b.kljuc) ?? Infinity));
  }
  const upit = tab === "odobreno"
    ? `SELECT ${STUPCI} FROM zvukovi WHERE status = 'odobren' ORDER BY id DESC LIMIT 400`
    : `SELECT ${STUPCI} FROM zvukovi WHERE id IN (SELECT id FROM (${ODBIJENI_KLJUCEVI})) ORDER BY id DESC LIMIT 400`;
  const { results } = await db.prepare(upit).all<Zvuk>();
  return results.map((z) => ({ kljuc: z.kljuc, izgovor: z.izgovor, snimke: [z], uIzradi: false, zadnjeOdbijanje: null }));
}

export interface GreskaPosla { id: number; kljuc: string; izgovor: string; greska: string | null; pokusaji: number; created_at: string }
export async function greskeIzgovora(): Promise<GreskaPosla[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, kljuc, izgovor, greska, pokusaji, created_at FROM zvuk_generiranja WHERE status = 'greska' ORDER BY id DESC LIMIT 200",
  ).all<GreskaPosla>();
  return results;
}

/**
 * Odobri: snimka ide na CDN, prijašnja odobrena za isti tekst postaje odbijena („zamijenjena”), a
 * ostali kandidati istog teksta odbijeni („odabrana druga”). Vraća false ako snimka nije kandidat.
 */
export async function odobriZvuk(id: number, email: string): Promise<boolean> {
  const db = env.DB;
  const z = await db.prepare("SELECT id, kljuc, status FROM zvukovi WHERE id = ?").bind(id).first<{ id: number; kljuc: string; status: string }>();
  if (!z || z.status !== "kandidat") return false;
  const { results: stari } = await db.prepare("SELECT id, r2_kljuc FROM zvukovi WHERE kljuc = ? AND status = 'odobren'").bind(z.kljuc).all<{ id: number; r2_kljuc: string }>();
  await db.batch([
    db.prepare("UPDATE zvukovi SET status = 'odbijen', razlog = 'zamijenjen novijom', pregledao = ?, pregledano_at = datetime('now') WHERE kljuc = ? AND status = 'odobren'").bind(email, z.kljuc),
    db.prepare("UPDATE zvukovi SET status = 'odbijen', razlog = 'odabrana druga snimka', pregledao = ?, pregledano_at = datetime('now') WHERE kljuc = ? AND status = 'kandidat' AND id != ?").bind(email, z.kljuc, id),
    db.prepare("UPDATE zvukovi SET status = 'odobren', razlog = NULL, pregledao = ?, pregledano_at = datetime('now') WHERE id = ?").bind(email, id),
  ]);
  await uskladiJavniZvuk(id);
  for (const s of stari) await makniJavni(s.r2_kljuc);
  return true;
}

/**
 * Odbij kandidate jednog teksta, s razlogom. Ako tekst više nema ni kandidata ni odobrene, novi
 * posao s varijantama (svi načini, čovjek bira), s ispravljenim izgovorom ako ga je upisao.
 * `ponovo: false` = samo odbij (ElevenLabs neke riječi ne zna izgovoriti; vraća se „Snimi ponovo”
 * na tabu Odbijeno). Vraća broj odbijenih.
 */
export async function odbijZvukove(ids: number[], email: string, o: { razlog?: string; izgovor?: string; ponovo?: boolean } = {}): Promise<number> {
  const db = env.DB;
  const odbij = db.prepare(
    `UPDATE zvukovi SET status = 'odbijen', razlog = ?, bez_ponavljanja = ?, pregledao = ?, pregledano_at = datetime('now')
     WHERE id IN (SELECT value FROM json_each(?)) AND status = 'kandidat' RETURNING kljuc, izgovor`,
  ).bind(o.razlog?.trim() || null, o.ponovo === false ? 1 : 0, email, JSON.stringify(ids));
  if (o.ponovo === false) return (await odbij.all()).results.length;
  // Odbijanje i novi poslovi u istom batchu s kvotom: bez kredita se ne odbija ni snimka (odluka 10).
  // Posao nastaje za tekst koji poslije odbijanja nema ni odobrene, ni kandidata, ni posla; kvota broji
  // isti uvjet unaprijed (kandidati iz `ids` se tada još ne računaju, jer ih ovaj batch odbija).
  const { results: kandidati } = await db.prepare(
    "SELECT kljuc, izgovor FROM zvukovi WHERE id IN (SELECT value FROM json_each(?)) AND status = 'kandidat' ORDER BY id",
  ).bind(JSON.stringify(ids)).all<{ kljuc: string; izgovor: string }>();
  const kljucevi = [...new Map(kandidati.map((r) => [r.kljuc, r.izgovor])).entries()];
  const nema = (k: string) => ({
    sql: `NOT EXISTS (SELECT 1 FROM zvukovi z WHERE z.kljuc = ? AND (z.status = 'odobren' OR (z.status = 'kandidat' AND z.id NOT IN (SELECT value FROM json_each(?)))))
      AND NOT EXISTS (SELECT 1 FROM zvuk_generiranja q WHERE q.kljuc = ? AND q.status IN ('ceka', 'radi'))`,
    args: [k, JSON.stringify(ids), k],
  });
  const kolicina = {
    sql: `SELECT COUNT(*) FROM json_each(?) k WHERE NOT EXISTS (SELECT 1 FROM zvukovi z WHERE z.kljuc = k.value
        AND (z.status = 'odobren' OR (z.status = 'kandidat' AND z.id NOT IN (SELECT value FROM json_each(?)))))
      AND NOT EXISTS (SELECT 1 FROM zvuk_generiranja q WHERE q.kljuc = k.value AND q.status IN ('ceka', 'radi'))`,
    args: [JSON.stringify(kljucevi.map(([k]) => k)), JSON.stringify(ids)],
  };
  const rez = await batchSKvotom(email, "zvukovi", kljucevi.length ? kolicina : 0, `odbijeno ${kljucevi.length}`, [
    odbij,
    ...kljucevi.map(([kljuc, izgovor]) => novPosao(kljuc, o.izgovor?.trim() || izgovor, email, true, nema(kljuc))),
  ]);
  await posalji(rez.slice(1).flatMap((r) => (r.results as { id: number }[]).map((x) => x.id)));
  return rez[0].results.length;
}

/** Tekst ponovno (odobren ili odbijen): posao s varijantama. Stara odobrena ostaje dok nova ne bude odobrena. */
export async function ponoviZvuk(kljuc: string, email: string, izgovor?: string): Promise<boolean> {
  const [s] = await stanjeZvukova([kljuc]);
  if (s.u_redu || s.kandidata) return false;
  await posalji(await upisiPoslove(email, 1, `izgovor ${kljuc}`, [novPosao(kljuc, izgovor?.trim() || izgovorZa(kljuc), email, true)]));
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
