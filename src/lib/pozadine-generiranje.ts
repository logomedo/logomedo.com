// Situacije: iz postojeće uspravne slike izgeneriraj vodoravnu (i obrnuto), ista slika u drugom
// omjeru. Red `pozadina_generiranja` (migrations/0020), obrađuje ga lokalni runner (scripts/runner.sh).
import { env } from "cloudflare:workers";
import { redPauziran } from "./postavke";
import { stvori, ucitajSliku, type Orijentacija } from "./pozadine";
import { zazvoni } from "./runner-zvono";

const DB = () => env.DB;
const ZASTARIO_MIN = 15;
const MAX_POKUSAJA = 3;

/** Omjeri koje Gemini image (Nano Banana) prima. */
const OMJERI = ["2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

/** Omjer za drugu orijentaciju: izvor zamijenjenih stranica, zaokružen na najbliži podržani. */
export const ciljniAspekt = (sirina: number, visina: number) => najbliziAspekt(visina, sirina);

/** Najbliži podržani omjer iste orijentacije. */
export function najbliziAspekt(sirina: number, visina: number): string {
  const cilj = sirina / visina;
  const kandidati = OMJERI.map((o) => { const [a, b] = o.split(":").map(Number); return { o, r: a / b }; })
    .filter((x) => (cilj > 1) === (x.r > 1));
  return kandidati.reduce((m, x) => (Math.abs(Math.log(x.r / cilj)) < Math.abs(Math.log(m.r / cilj)) ? x : m)).o;
}

export function promptZa(u: Orijentacija, aspekt: string, naziv: string, opis: string | null): string {
  const gdje = u === "vodoravno" ? "on the left and right sides" : "at the top and bottom";
  return [
    `Recreate the attached illustration as a ${u === "vodoravno" ? "landscape" : "portrait"} picture with a ${aspekt} aspect ratio.`,
    "It must be the very same picture: identical art style, line work, colors, lighting, characters, animals and objects,",
    "with the same look, poses and positions relative to each other.",
    `Only the frame changes: extend the scene naturally ${gdje} so that it fills the new shape,`,
    "and keep every character and important object fully visible (move or rescale them slightly only if they would not fit).",
    "Do not add new characters or objects, do not remove any, no text, no letters, no border, no frame.",
    `The scene: ${naziv}${opis ? `. ${opis}` : ""}.`,
  ].join(" ");
}

/** Izmjena iste slike po uputi admina (duplikat situacije), isti kadar. */
export function promptIzmjene(o: Orijentacija, aspekt: string, uputa: string, naziv: string, opis: string | null): string {
  return [
    "Edit the attached illustration.",
    "Keep it the very same picture: identical art style, line work, colors, lighting, characters, animals and objects,",
    `and the same ${o === "vodoravno" ? "landscape" : "portrait"} ${aspekt} frame.`,
    `Apply only this change (the instruction may be in Croatian): «${uputa}».`,
    "Everything not mentioned in the change stays as it is. No text, no letters, no border, no frame.",
    `The scene: ${naziv}${opis ? `. ${opis}` : ""}.`,
  ].join(" ");
}

export interface PosaoPozadine { id: number; pozadina_id: number; u: Orijentacija; status: string; greska: string | null }

/** Zadnji posao za svaku situaciju (za prikaz stanja na /admin/situacije). */
export async function zadnjiPoslovi(): Promise<Map<number, PosaoPozadine>> {
  const { results } = await DB().prepare(
    `SELECT id, pozadina_id, u, status, greska FROM pozadina_generiranja g
     WHERE id = (SELECT MAX(id) FROM pozadina_generiranja WHERE pozadina_id = g.pozadina_id)`,
  ).all<PosaoPozadine>();
  return new Map(results.map((p) => [p.pozadina_id, p]));
}

/** U red: generiraj orijentaciju koja nedostaje iz one koja postoji. */
export async function zatrazi(pozadinaId: number, email: string): Promise<{ ok: true; u: Orijentacija } | { greska: string }> {
  const { results: slike } = await DB().prepare(
    `SELECT s.orijentacija, s.r2_kljuc, s.sirina, s.visina, p.naziv, p.opis FROM pozadina_slike s
     JOIN pozadine p ON p.id = s.pozadina_id WHERE s.pozadina_id = ? AND p.obrisan_at IS NULL`,
  ).bind(pozadinaId).all<{ orijentacija: Orijentacija; r2_kljuc: string; sirina: number; visina: number; naziv: string; opis: string | null }>();
  if (slike.length !== 1) return { greska: slike.length ? "Situacija već ima obje slike." : "Situacija nema nijednu sliku." };
  const iz = slike[0];
  const u: Orijentacija = iz.orijentacija === "uspravno" ? "vodoravno" : "uspravno";
  const aspekt = ciljniAspekt(iz.sirina, iz.visina);
  const r = await DB().prepare(
    `INSERT INTO pozadina_generiranja (pozadina_id, iz, u, izvor_kljuc, aspekt, prompt, zatrazio)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
     WHERE NOT EXISTS (SELECT 1 FROM pozadina_generiranja WHERE pozadina_id = ?1 AND status IN ('ceka', 'radi'))`,
  ).bind(pozadinaId, iz.orijentacija, u, iz.r2_kljuc, aspekt, promptZa(u, aspekt, iz.naziv, iz.opis), email).run();
  if (!r.meta.changes) return { greska: "Generiranje je već u redu." };
  await zazvoni();
  return { ok: true, u };
}

/**
 * Duplikat situacije. Bez upute: kopija s obje slike. S uputom: kopija bez slika i posao koji
 * iz slike orijentacije `o` izvorne situacije napravi izmijenjenu sliku iste orijentacije.
 */
export async function dupliciraj(pozadinaId: number, o: Orijentacija, uputa: string, email: string, autorId: number):
  Promise<{ id: number; generira: boolean } | { greska: string }> {
  const p = await DB().prepare("SELECT naziv, opis FROM pozadine WHERE id = ? AND obrisan_at IS NULL").bind(pozadinaId)
    .first<{ naziv: string; opis: string | null }>();
  if (!p) return { greska: "Nepoznata situacija." };
  const { results: slike } = await DB().prepare("SELECT orijentacija, r2_kljuc, mime, sirina, visina, prompt FROM pozadina_slike WHERE pozadina_id = ?")
    .bind(pozadinaId).all<{ orijentacija: Orijentacija; r2_kljuc: string; mime: string; sirina: number; visina: number; prompt: string | null }>();
  uputa = uputa.trim().slice(0, 1000);
  const iz = slike.find((s) => s.orijentacija === o);
  if (uputa && !iz) return { greska: `Situacija nema ${o === "uspravno" ? "uspravnu" : "vodoravnu"} sliku.` };
  const naziv = `${p.naziv.slice(0, 110)} (kopija)`;
  const id = await stvori(naziv, p.opis ?? "", autorId);
  if (!uputa) {
    for (const s of slike) {
      const obj = await env.SLIKE.get(s.r2_kljuc);
      if (obj) await ucitajSliku(id, s.mime, await obj.arrayBuffer(), s.prompt, email);
    }
    return { id, generira: false };
  }
  const aspekt = najbliziAspekt(iz!.sirina, iz!.visina);
  await DB().prepare(
    "INSERT INTO pozadina_generiranja (pozadina_id, iz, u, izvor_kljuc, aspekt, prompt, zatrazio) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, o, o, iz!.r2_kljuc, aspekt, promptIzmjene(o, aspekt, uputa, p.naziv, p.opis), email).run();
  await zazvoni();
  return { id, generira: true };
}

/** Ponovi zadnji neuspjeli posao situacije (isti predložak i prompt). */
export async function ponovi(pozadinaId: number, email: string): Promise<boolean> {
  const r = await DB().prepare(
    `INSERT INTO pozadina_generiranja (pozadina_id, iz, u, izvor_kljuc, aspekt, prompt, zatrazio)
     SELECT pozadina_id, iz, u, izvor_kljuc, aspekt, prompt, ?2 FROM pozadina_generiranja
     WHERE id = (SELECT MAX(id) FROM pozadina_generiranja WHERE pozadina_id = ?1) AND status = 'greska'`,
  ).bind(pozadinaId, email).run();
  if (r.meta.changes) await zazvoni();
  return !!r.meta.changes;
}

export interface PosaoZaRunner {
  id: number; vrsta: "pozadina"; rijec: string; stil: string; prompt: string; izvor: string; aspekt: string; pokusaji: number;
}

/** Runner: sljedeći posao situacije (prije riječi, jer admin čeka na stranici). */
export async function uzmiPozadinu(): Promise<PosaoZaRunner | null> {
  await DB().prepare(
    `UPDATE pozadina_generiranja SET status = 'ceka' WHERE status = 'radi' AND uzeto_at < datetime('now', '-${ZASTARIO_MIN} minutes')`,
  ).run();
  if (await redPauziran()) return null;
  // Slika ciljne orijentacije učitana ručno u međuvremenu: posao više ne treba.
  await DB().prepare(
    `UPDATE pozadina_generiranja SET status = 'gotovo', zavrseno_at = datetime('now'), greska = 'već postoji'
     WHERE status = 'ceka' AND EXISTS (SELECT 1 FROM pozadina_slike s WHERE s.pozadina_id = pozadina_generiranja.pozadina_id AND s.orijentacija = pozadina_generiranja.u)`,
  ).run();
  const p = await DB().prepare(
    `UPDATE pozadina_generiranja SET status = 'radi', uzeto_at = datetime('now'), pokusaji = pokusaji + 1
     WHERE id = (SELECT id FROM pozadina_generiranja WHERE status = 'ceka' ORDER BY id LIMIT 1) AND status = 'ceka'
     RETURNING id, pozadina_id, izvor_kljuc, aspekt, prompt, pokusaji`,
  ).first<{ id: number; pozadina_id: number; izvor_kljuc: string; aspekt: string; prompt: string; pokusaji: number }>();
  if (!p) return null;
  const n = await DB().prepare("SELECT naziv FROM pozadine WHERE id = ?").bind(p.pozadina_id).first<{ naziv: string }>();
  return {
    id: p.id, vrsta: "pozadina", rijec: `situacija ${n?.naziv ?? p.pozadina_id}`, stil: "", prompt: p.prompt,
    izvor: `/cdn/${p.izvor_kljuc}`, aspekt: p.aspekt, pokusaji: p.pokusaji,
  };
}

/** Slika od runnera: sprema se kao ciljna orijentacija (samo ako ju je model stvarno dao). */
export async function predajPozadinu(posaoId: number, mime: string, tijelo: ArrayBuffer, model: string | null) {
  const p = await DB().prepare("SELECT pozadina_id, u, prompt, zatrazio FROM pozadina_generiranja WHERE id = ? AND status = 'radi'")
    .bind(posaoId).first<{ pozadina_id: number; u: Orijentacija; prompt: string; zatrazio: string }>();
  if (!p) return { greska: "posao ne postoji ili nije u radu" };
  const r = await ucitajSliku(p.pozadina_id, mime, tijelo, `${p.prompt}\n\n(model: ${model ?? "?"})`, p.zatrazio, { ocekivana: p.u, izvor: "agy" });
  if ("greska" in r) {
    await neuspjehPozadine(posaoId, r.greska);
    return r;
  }
  await DB().prepare("UPDATE pozadina_generiranja SET status = 'gotovo', zavrseno_at = datetime('now'), greska = NULL WHERE id = ?").bind(posaoId).run();
  return { ok: true };
}

export async function odgodiPozadinu(posaoId: number, razlog: string) {
  await DB().prepare(
    "UPDATE pozadina_generiranja SET status = 'ceka', pokusaji = MAX(pokusaji - 1, 0), uzeto_at = NULL, greska = ? WHERE id = ? AND status = 'radi'",
  ).bind(razlog.slice(0, 500), posaoId).run();
}

export async function neuspjehPozadine(posaoId: number, greska: string) {
  await DB().prepare(
    `UPDATE pozadina_generiranja SET greska = ?, status = CASE WHEN pokusaji >= ${MAX_POKUSAJA} THEN 'greska' ELSE 'ceka' END
     WHERE id = ? AND status = 'radi'`,
  ).bind(greska.slice(0, 500), posaoId).run();
}
