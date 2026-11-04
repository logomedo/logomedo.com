// Upiti kataloga za admin. Svi brojevi su po stilu (zasad samo „bojanka”).
import { env } from "cloudflare:workers";
import type { Pozicija } from "./fonemi";

export interface Glas { id: number; oznaka: string; slug: string; skupina: string | null; skupine: number }
export interface Stil { id: number; kod: string; naziv: string; predlozak: string; model: string }

export interface GlasPregled extends Glas {
  rijeci: number; odobreno: number; kandidata: number; uRedu: number;
}

export interface RijecRed {
  id: number; rijec: string; slug: string; pozicija: Pozicija; potvrdeno: number;
  legacy_koristeno: number; odobrena_id: number | null; kandidata: number; u_redu: number;
}

export interface Slika {
  id: number; rijec_id: number; status: "kandidat" | "odobrena" | "odbijena"; razlog: string | null;
  prompt: string | null; model: string | null; izvor: string; created_at: string; pregledao: string | null; r2_kljuc: string;
  /** Samo iz `rijec()`: kod i naziv stila slike. */
  stil?: string; stil_naziv?: string;
}

export const DB = () => env.DB;

export async function stil(kod = "bojanka"): Promise<Stil> {
  const s = await DB().prepare("SELECT id, kod, naziv, predlozak, model FROM stilovi WHERE kod = ?").bind(kod).first<Stil>();
  if (!s) throw new Error(`Nema stila ${kod}: je li seed učitan?`);
  return s;
}

/** Stil iz URL-a (`?stil=`); nepoznat ili prazan = bojanka. */
export async function stilIzUrla(url: URL): Promise<Stil> {
  const kod = url.searchParams.get("stil");
  return (kod && (await DB().prepare("SELECT id, kod, naziv, predlozak, model FROM stilovi WHERE kod = ?").bind(kod).first<Stil>())) || stil();
}

export async function glasovi(stilId: number): Promise<GlasPregled[]> {
  const { results } = await DB().prepare(
    `SELECT g.id, g.oznaka, g.slug, g.skupina, g.skupine,
       COUNT(DISTINCT rg.rijec_id) AS rijeci,
       COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM slike s WHERE s.rijec_id = rg.rijec_id AND s.stil_id = ?1 AND s.status = 'odobrena') THEN rg.rijec_id END) AS odobreno,
       COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM slike s WHERE s.rijec_id = rg.rijec_id AND s.stil_id = ?1 AND s.status = 'kandidat') THEN rg.rijec_id END) AS kandidata,
       COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM generiranja q WHERE q.rijec_id = rg.rijec_id AND q.stil_id = ?1 AND q.status IN ('ceka','radi')) THEN rg.rijec_id END) AS uRedu
     FROM glasovi g LEFT JOIN rijec_glas rg ON rg.glas_id = g.id
     GROUP BY g.id ORDER BY g.redoslijed`,
  ).bind(stilId).all<GlasPregled>();
  return results;
}

export async function glas(slug: string): Promise<Glas | null> {
  return DB().prepare("SELECT id, oznaka, slug, skupina, skupine FROM glasovi WHERE slug = ?").bind(slug).first<Glas>();
}

export async function rijeciGlasa(glasId: number, stilId: number): Promise<RijecRed[]> {
  const { results } = await DB().prepare(
    `SELECT r.id, r.rijec, r.slug, rg.pozicija, rg.potvrdeno, r.legacy_koristeno,
       (SELECT s.id FROM slike s WHERE s.rijec_id = r.id AND s.stil_id = ?2 AND s.status = 'odobrena') AS odobrena_id,
       (SELECT COUNT(*) FROM slike s WHERE s.rijec_id = r.id AND s.stil_id = ?2 AND s.status = 'kandidat') AS kandidata,
       (SELECT COUNT(*) FROM generiranja q WHERE q.rijec_id = r.id AND q.stil_id = ?2 AND q.status IN ('ceka','radi')) AS u_redu
     FROM rijec_glas rg JOIN rijeci r ON r.id = rg.rijec_id
     WHERE rg.glas_id = ?1 AND r.aktivna = 1
     ORDER BY r.rijec COLLATE NOCASE`,
  ).bind(glasId, stilId).all<RijecRed>();
  return results;
}

export interface RijecDetalj {
  id: number; rijec: string; slug: string; opis_za_sliku: string | null; recenica: string | null;
  legacy_koristeno: number; izvor: string; rima: string | null;
}

export async function rijec(slug: string) {
  const r = await DB().prepare(
    "SELECT id, rijec, slug, opis_za_sliku, recenica, legacy_koristeno, izvor, rima FROM rijeci WHERE slug = ?",
  ).bind(slug).first<RijecDetalj>();
  if (!r) return null;
  const [pozicije, slike, red] = await DB().batch([
    DB().prepare(
      `SELECT g.oznaka, g.slug, rg.pozicija, rg.potvrdeno FROM rijec_glas rg JOIN glasovi g ON g.id = rg.glas_id
       WHERE rg.rijec_id = ? ORDER BY g.redoslijed`,
    ).bind(r.id),
    DB().prepare(
      `SELECT x.id, x.rijec_id, x.status, x.razlog, x.prompt, x.model, x.izvor, x.created_at, x.pregledao, x.r2_kljuc,
         st.kod AS stil, st.naziv AS stil_naziv
       FROM slike x JOIN stilovi st ON st.id = x.stil_id
       WHERE x.rijec_id = ? ORDER BY CASE x.status WHEN 'odobrena' THEN 0 WHEN 'kandidat' THEN 1 ELSE 2 END, x.id DESC`,
    ).bind(r.id),
    DB().prepare(
      `SELECT q.id, q.status, q.pokusaji, q.greska, q.created_at, st.kod AS stil, st.naziv AS stil_naziv
       FROM generiranja q JOIN stilovi st ON st.id = q.stil_id
       WHERE q.rijec_id = ? AND q.status IN ('ceka','radi','greska') ORDER BY q.id DESC`,
    ).bind(r.id),
  ]);
  return {
    ...r,
    pozicije: pozicije.results as { oznaka: string; slug: string; pozicija: Pozicija; potvrdeno: number }[],
    slike: slike.results as unknown as Slika[],
    red: red.results as { id: number; status: string; pokusaji: number; greska: string | null; created_at: string; stil: string; stil_naziv: string }[],
  };
}

/** Brojevi za sve stilove zajedno (isti kao u bočnoj traci). */
export async function ukupnoSvihStilova() {
  return (await DB().prepare(
    `SELECT (SELECT COUNT(*) FROM slike WHERE status = 'kandidat') AS kandidata,
       (SELECT COUNT(*) FROM generiranja WHERE status IN ('ceka','radi')) AS uRedu,
       (SELECT COUNT(*) FROM generiranja WHERE status = 'greska') AS gresaka`,
  ).first<{ kandidata: number; uRedu: number; gresaka: number }>())!;
}

/** Ukupni brojevi za zaglavlje. */
export async function ukupno(stilId: number) {
  return (await DB().prepare(
    `SELECT (SELECT COUNT(*) FROM rijeci WHERE aktivna = 1) AS rijeci,
       (SELECT COUNT(*) FROM slike WHERE stil_id = ?1 AND status = 'odobrena') AS odobreno,
       (SELECT COUNT(*) FROM slike WHERE stil_id = ?1 AND status = 'kandidat') AS kandidata,
       (SELECT COUNT(*) FROM generiranja WHERE stil_id = ?1 AND status IN ('ceka','radi')) AS uRedu,
       (SELECT COUNT(*) FROM generiranja WHERE stil_id = ?1 AND status = 'greska') AS gresaka`,
  ).bind(stilId).first<{ rijeci: number; odobreno: number; kandidata: number; uRedu: number; gresaka: number }>())!;
}

export const NAZIV_POZICIJE: Record<Pozicija, string> = {
  inicijalna: "Inicijalna", medijalna: "Medijalna", finalna: "Finalna", skupina: "Skupine",
};

export function kad(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleString("hr-HR", { timeZone: "Europe/Zagreb", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Aktivni stilovi (za izbor pri uploadu). */
export async function stiloviAktivni() {
  return (await DB().prepare("SELECT kod, naziv FROM stilovi WHERE aktivan = 1 ORDER BY id").all<{ kod: string; naziv: string }>()).results;
}

/** Sve aktivne riječi za tražilicu: r = riječ, s = slug, o = ima odobrenu sliku (bilo koji stil), k = broj kandidata. */
export async function indeksRijeci() {
  return (await DB().prepare(
    `SELECT r.rijec AS r, r.slug AS s,
       EXISTS (SELECT 1 FROM slike x WHERE x.rijec_id = r.id AND x.status = 'odobrena') AS o,
       (SELECT COUNT(*) FROM slike x WHERE x.rijec_id = r.id AND x.status = 'kandidat') AS k
     FROM rijeci r WHERE r.aktivna = 1 ORDER BY r.rijec`,
  ).all<{ r: string; s: string; o: number; k: number }>()).results;
}
