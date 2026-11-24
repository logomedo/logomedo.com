// Klonovi glasa (docs/klon-glasa.md): uzorci u privatnom R2 (SLIKE, `klon/<id>/…`), red u D1, izrada kroz
// ElevenLabs Instant Voice Clone. Probe klona su mp3 u R2 (`klon/<id>/proba/<hash>.mp3`), bez D1 retka.
import { env } from "cloudflare:workers";
import { izgovori, napraviKlon, obrisiGlas, prepisi } from "./elevenlabs";
import { ODLOMCI, type Mjerenje } from "./klon-tekst";
import { slicnost } from "./zvukovi-tekst";

export interface Klon {
  id: number; ime: string; govornik: string; suglasnost: string; suglasnost_at: string; voice_id: string | null;
  stanje: "nacrt" | "napravljen" | "obrisan"; ukloni_sum: number; greska: string | null; napravio: string;
  napravljeno_at: string; klonirano_at: string | null;
}
export interface Uzorak {
  id: number; klon_id: number; odlomak: number | null; r2_kljuc: string; mime: string; trajanje: number;
  vrh_db: number | null; rms_db: number | null; sum_db: number | null; pauza: number | null; klipova: number | null;
  prijepis: string | null; slicnost: number | null; ukljucen: number; snimljeno_at: string;
}

/** Izjava koju govornik potvrđuje; sprema se doslovno uz klon. */
export const SUGLASNOST = (govornik: string) =>
  `Ja, ${govornik}, vlasnik sam ovog glasa i pristajem da LogoMedo od mojih snimki napravi umjetni (klonirani) glas u ElevenLabsu i njime izgovara tekstove u aplikaciji i videima. Suglasnost mogu povući, a tada se klon briše.`;

const DOPUSTENI = ["audio/wav", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/webm", "audio/ogg", "audio/flac"];
export const MAX_UZORAK = 20 * 1024 * 1024;

async function hash16(b: ArrayBuffer | string) {
  const ulaz = typeof b === "string" ? new TextEncoder().encode(b) : b;
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", ulaz));
  return [...h.slice(0, 8)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const klonovi = async () =>
  (await env.DB.prepare("SELECT * FROM klonovi WHERE stanje != 'obrisan' ORDER BY id DESC").all<Klon>()).results;
export const klon = (id: number) => env.DB.prepare("SELECT * FROM klonovi WHERE id = ?").bind(id).first<Klon>();
export const uzorci = async (klonId: number) =>
  (await env.DB.prepare("SELECT * FROM klon_uzorci WHERE klon_id = ? ORDER BY COALESCE(odlomak, 999), id").bind(klonId).all<Uzorak>()).results;
export const uzorak = (id: number) => env.DB.prepare("SELECT * FROM klon_uzorci WHERE id = ?").bind(id).first<Uzorak>();

export async function noviKlon(ime: string, govornik: string, email: string): Promise<number> {
  const r = await env.DB.prepare("INSERT INTO klonovi (ime, govornik, suglasnost, napravio) VALUES (?, ?, ?, ?) RETURNING id")
    .bind(ime, govornik, SUGLASNOST(govornik), email).first<{ id: number }>();
  return r!.id;
}

/**
 * Spremi uzorak i odmah ga prepiši (Scribe) za usporedbu s odlomkom. Novija snimka istog odlomka isključi
 * stariju (ostaje za preslušavanje). Vraća id.
 */
export async function spremiUzorak(klonId: number, odlomak: number | null, podaci: ArrayBuffer, mime: string, m: Mjerenje, email: string): Promise<number> {
  if (!DOPUSTENI.includes(mime)) throw new Error(`Format ${mime} nije podržan (WAV, MP3, M4A, OGG, FLAC).`);
  if (podaci.byteLength > MAX_UZORAK) throw new Error("Datoteka je veća od 20 MB.");
  if (odlomak !== null && !ODLOMCI[odlomak]) throw new Error("Nepoznat odlomak.");
  const r2 = `klon/${klonId}/${await hash16(podaci)}.${mime.split("/")[1].replace("x-", "").replace("mpeg", "mp3")}`;
  await env.SLIKE.put(r2, podaci, { httpMetadata: { contentType: mime } });
  let prijepis: string | null = null;
  try { prijepis = await prepisi(podaci, mime); } catch (e) { console.error(`STT uzorka: ${e}`); }
  const sl = prijepis !== null && odlomak !== null ? slicnost(ODLOMCI[odlomak].tekst, prijepis) : null;
  if (odlomak !== null) await env.DB.prepare("UPDATE klon_uzorci SET ukljucen = 0 WHERE klon_id = ? AND odlomak = ?").bind(klonId, odlomak).run();
  const r = await env.DB.prepare(
    `INSERT INTO klon_uzorci (klon_id, odlomak, r2_kljuc, mime, trajanje, vrh_db, rms_db, sum_db, pauza, klipova, prijepis, slicnost, snimio)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(klonId, odlomak, r2, mime, m.trajanje, m.vrhDb, m.rmsDb, m.sumDb, m.pauza, m.klipova, prijepis, sl, email).first<{ id: number }>();
  return r!.id;
}

export async function ukljuci(id: number, da: boolean) {
  await env.DB.prepare("UPDATE klon_uzorci SET ukljucen = ? WHERE id = ?").bind(da ? 1 : 0, id).run();
}

export async function obrisiUzorak(id: number) {
  const u = await uzorak(id);
  if (!u) return;
  await env.DB.prepare("DELETE FROM klon_uzorci WHERE id = ?").bind(id).run();
  await env.SLIKE.delete(u.r2_kljuc);
}

/** Pošalji uključene uzorke ElevenLabsu. Ponovna izrada briše stari glas (mjesto na računu). */
export async function kloniraj(k: Klon, ukloniSum: boolean): Promise<string> {
  const us = (await uzorci(k.id)).filter((u) => u.ukljucen);
  if (us.reduce((s, u) => s + u.trajanje, 0) < 10) throw new Error("Treba barem 10 s uključenih snimki.");
  const datoteke = await Promise.all(us.map(async (u, i) => {
    const o = await env.SLIKE.get(u.r2_kljuc);
    if (!o) throw new Error(`Nema snimke ${u.id} u R2.`);
    return { ime: `uzorak-${i + 1}.${u.r2_kljuc.split(".").pop()}`, mime: u.mime, podaci: await o.arrayBuffer() };
  }));
  try {
    const r = await napraviKlon(k.ime, `LogoMedo klon: ${k.govornik} (hrvatski)`, datoteke, ukloniSum);
    if (k.voice_id && k.voice_id !== r.voice_id) await obrisiGlas(k.voice_id).catch((e) => console.error(`Stari klon: ${e}`));
    await env.DB.prepare("UPDATE klonovi SET voice_id = ?, stanje = 'napravljen', ukloni_sum = ?, greska = NULL, klonirano_at = datetime('now') WHERE id = ?")
      .bind(r.voice_id, ukloniSum ? 1 : 0, k.id).run();
    return r.voice_id;
  } catch (e) {
    await env.DB.prepare("UPDATE klonovi SET greska = ? WHERE id = ?").bind(String(e instanceof Error ? e.message : e).slice(0, 500), k.id).run();
    throw e;
  }
}

/** Briše glas na ElevenLabsu i sve snimke (povučena suglasnost ili višak). Redak ostaje kao trag. */
export async function obrisiKlon(k: Klon) {
  if (k.voice_id) await obrisiGlas(k.voice_id);
  for (const u of await uzorci(k.id)) await env.SLIKE.delete(u.r2_kljuc);
  const probe = await env.SLIKE.list({ prefix: `klon/${k.id}/proba/` });
  for (const o of probe.objects) await env.SLIKE.delete(o.key);
  await env.DB.prepare("DELETE FROM klon_uzorci WHERE klon_id = ?").bind(k.id).run();
  await env.DB.prepare("UPDATE klonovi SET stanje = 'obrisan', voice_id = NULL WHERE id = ?").bind(k.id).run();
}

export interface ProbaKlona { kljuc: string; tekst: string; model: string; kada: string }

/** Proba klona: isti (model, tekst) se ne plaća dvaput. */
export async function probaj(k: Klon, model: string, tekst: string): Promise<ProbaKlona> {
  if (!k.voice_id) throw new Error("Klon još nije napravljen.");
  const kljuc = `klon/${k.id}/proba/${await hash16(`${k.voice_id}|${model}|${tekst}`)}.mp3`;
  const ima = await env.SLIKE.head(kljuc);
  if (ima) return { kljuc, tekst, model, kada: ima.uploaded.toISOString() };
  const mp3 = await izgovori(tekst, k.voice_id, model);
  await env.SLIKE.put(kljuc, mp3, { httpMetadata: { contentType: "audio/mpeg" }, customMetadata: { tekst: tekst.slice(0, 1000), model } });
  return { kljuc, tekst, model, kada: new Date().toISOString() };
}

export async function probeKlona(k: Klon): Promise<ProbaKlona[]> {
  const l = await env.SLIKE.list({ prefix: `klon/${k.id}/proba/`, include: ["customMetadata"] });
  return l.objects
    .map((o) => ({ kljuc: o.key, tekst: o.customMetadata?.tekst ?? "", model: o.customMetadata?.model ?? "", kada: o.uploaded.toISOString() }))
    .sort((a, b) => b.kada.localeCompare(a.kada));
}
