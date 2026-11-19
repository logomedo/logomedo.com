// Radni listić po glasovima: koje riječi ulaze. Isto pravilo u obrascu (broj slika uživo) i na
// poslužitelju (slaganje), pa broj na gumbu odgovara listiću.
import { fonemi, SAMOGLASNICI } from "../fonemi.ts";
import { brojSlogova } from "./rima.ts";
import { pozicijaGlasa } from "./slusanje.ts";
import { kljuc, poCiljevima, type Odnos } from "./odnosi.ts";
import { MAX_PAROVA, MAX_REDOVA } from "./vrste.ts";

/** Riječ sa slikom i pojavama glasova iz kataloga (`rijec_glas`: id glasa, pozicija). */
export interface RijecGlasova { id: number; rijec: string; rima?: string | null; g: [number, string][] }
/**
 * `glasovi`: riječ ima barem jedan od njih na `pozicija` (prazno = bilo gdje); prazan popis = svaka riječ.
 * `bez`: nijedan od tih glasova nije nigdje u riječi (po fonemima: „bez L” ne izbacuje LJULJAČKU).
 * `uz`: oznake odabranih glasova kad je uključeno „uz samoglasnike”: glas na toj poziciji ima do sebe samo
 * samoglasnike (inicijalno SOK, SAT, ne STOL ni SNIJEG; medijalno KOSA, ne MASKA; finalno NOS, ne PAS-T…).
 */
export interface FiltarListica { glasovi: number[]; pozicija: string; bez: string[]; uz?: string[] }

/** Pozicija pojave glasa u nizu fonema (bez skupine: ona nikad nije uz samoglasnik). */
const pozicijaU = (i: number, n: number) => (i === 0 ? "inicijalna" : i === n - 1 ? "finalna" : "medijalna");

/** Riječ ima neki od glasova `uz` na poziciji (prazno = bilo gdje) tako da su mu susjedi samoglasnici. */
export function uzSamoglasnike(rijec: string, uz: string[], pozicija: string): boolean {
  const f = fonemi(rijec);
  return f.some((g, i) => uz.includes(g) && (!pozicija || pozicijaU(i, f.length) === pozicija)
    && (i === 0 || SAMOGLASNICI.has(f[i - 1])) && (i === f.length - 1 || SAMOGLASNICI.has(f[i + 1])));
}

export const POZICIJE_LISTICA: Record<string, string> = {
  "": "bilo gdje", inicijalna: "inicijalna pozicija", medijalna: "medijalna pozicija", finalna: "finalna pozicija", skupina: "skupine",
};

export function odgovara(r: RijecGlasova, f: FiltarListica): boolean {
  if (f.glasovi.length && !r.g.some(([g, p]) => f.glasovi.includes(g) && (!f.pozicija || p === f.pozicija))) return false;
  if (f.uz?.length && !uzSamoglasnike(r.rijec, f.uz, f.pozicija)) return false;
  if (f.bez.length) {
    const ima = new Set(fonemi(r.rijec));
    if (f.bez.some((b) => ima.has(b))) return false;
  }
  return true;
}

/** „Glasovi L, R – inicijalna pozicija, uz samoglasnike, bez Š” */
export function naslovListica(oznake: string[], pozicija: string, bez: string[], uz = false): string {
  const dijelovi: string[] = [];
  if (oznake.length) dijelovi.push(`${oznake.length > 1 ? "Glasovi" : "Glas"} ${oznake.join(", ")}${pozicija ? ` – ${POZICIJE_LISTICA[pozicija]}` : ""}${uz ? (pozicija ? ", uz samoglasnike" : " uz samoglasnike") : ""}`);
  if (bez.length) dijelovi.push(`${oznake.length ? "bez" : "Bez"} ${bez.join(", ")}`);
  return dijelovi.join(", ");
}

/** Izbor broja slika za listić; „sve” = sve riječi koje odgovaraju (do najviše kartica listića). */
export const BROJEVI_LISTICA = [6, 8, 9, 12, 15, 16, 20, 24, 30, 36] as const;
export const ZADANO_SLIKA = 12;

/** Koliko slika: broj iz obrasca ili sve (`0`), najviše `max`. */
export function brojSlika(ulaz: string | null, max: number): number {
  if (ulaz === "sve") return max;
  const n = Number(ulaz);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : ZADANO_SLIKA;
}

/** `n` riječi: kad ih ima više, nasumičnih `n` (redom kako su izvučene); inače sve, abecedno kako su došle. */
export function izaberi<T>(sve: T[], n: number, rnd: () => number = Math.random): T[] {
  if (sve.length <= n) return sve;
  const b = [...sve];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b.slice(0, n);
}

// ---- Ostali predlošci po glasovima (logopedski mod) ----

/** Predlošci s gumbom „Po glasovima…”. Scena i vizualna percepcija ga nemaju (scenu slaže logoped, percepcija se ne izgovara). */
export const PO_GLASOVIMA = ["listic", "slogovi", "odabir", "povezivanje", "uljez", "prvi_glas", "koje_slovo", "pozicija_glasa"] as const;
export type VrstaPoGlasovima = (typeof PO_GLASOVIMA)[number];
export const jePoGlasovima = (v: string): v is VrstaPoGlasovima => (PO_GLASOVIMA as readonly string[]).includes(v);
/** Zadaci odnosa (rima, prvi glas…) uzimaju riječi do 3 sloga (isto kao poslužitelj: `maxSlogova`). */
export const RIMA_MAX_SLOGOVA = 3;

/**
 * Koliko građe ima predložak za filtar: listić i prebrajanje broje riječi s glasom; uparivanje i povezivanje
 * skupine odnosa (iste rime, istog prvog glasa…; 2+ riječi) u kojima je barem jedna s glasom, uljez takve
 * skupine od 3+. `bez` vrijedi za sve riječi.
 */
export function moguce(vrsta: Exclude<VrstaPoGlasovima, "prvi_glas" | "koje_slovo" | "pozicija_glasa">, rijeci: RijecGlasova[], f: FiltarListica, odnos: Odnos = "rima"): number {
  if (vrsta === "listic" || vrsta === "slogovi") return rijeci.filter((r) => odgovara(r, f)).length;
  const K = (r: RijecGlasova) => kljuc(odnos, r);
  const sve = rijeci.filter((r) => K(r) && brojSlogova(r.rijec) <= RIMA_MAX_SLOGOVA && odgovara(r, { glasovi: [], pozicija: "", bez: f.bez }));
  const skupine = new Map<string, RijecGlasova[]>();
  for (const r of sve) skupine.set(K(r)!, [...(skupine.get(K(r)!) ?? []), r]);
  const najmanje = vrsta === "uljez" ? 3 : 2;
  return [...skupine.values()].filter((g) => g.length >= najmanje && g.some((r) => odgovara(r, f))).length;
}

export type VrstaOdnosa = "odabir" | "povezivanje" | "uljez";
/**
 * Koliko redova (parova) po glasovima: odabrani broj (zadano 4), a barem po jedan za svaki odabrani glas
 * (s jednim glasom svi redovi tog glasa).
 */
export const redovaZaGlasove = (vrsta: VrstaOdnosa, glasova: number, zeljeno = 4) =>
  Math.min(Math.max(glasova, zeljeno), vrsta === "povezivanje" ? MAX_PAROVA : MAX_REDOVA);

/** Uvjet „riječ ima ovaj glas na poziciji” za svaki odabrani glas (redom kojim su odabrani). */
export const ciljeviGlasova = (f: FiltarListica) =>
  f.glasovi.map((g) => (r: RijecGlasova) => odgovara(r, { glasovi: [g], pozicija: f.pozicija, bez: [] }));

/**
 * Uparivanje, povezivanje, uljez po glasovima: koliko redova će biti i koji odabrani glasovi nemaju nijedan
 * (nema skupine odnosa s tim glasom). Bez odabranih glasova: `zeljeno` nasumičnih skupina.
 */
export function rasporedOdnosa(vrsta: VrstaOdnosa, rijeci: RijecGlasova[], f: FiltarListica, odnos: Odnos, zeljeno = 4): { redova: number; mogucih: number; prazni: number[] } {
  const K = (r: RijecGlasova) => kljuc(odnos, r);
  const skupine = new Map<string, RijecGlasova[]>();
  // Riječ i slika: svaka riječ je sama svoj par (napisana i slika).
  const par = odnos === "ista_rijec";
  for (const r of rijeci) if (K(r) && brojSlogova(r.rijec) <= RIMA_MAX_SLOGOVA && odgovara(r, { glasovi: [], pozicija: "", bez: f.bez })) skupine.set(K(r)!, par ? [r, r] : [...(skupine.get(K(r)!) ?? []), r]);
  const velike = [...skupine.values()].filter((g) => g.length >= (vrsta === "uljez" ? 3 : 2));
  if (!f.glasovi.length) return { redova: Math.min(velike.length, redovaZaGlasove(vrsta, 0, zeljeno)), mogucih: velike.length, prazni: [] };
  const n = redovaZaGlasove(vrsta, f.glasovi.length, zeljeno);
  const r = poCiljevima(velike, ciljeviGlasova(f), n, vrsta === "uljez" ? 3 : 2);
  const prazni = f.glasovi.filter((_, i) => !r.some((x) => x.cilj === i));
  // Povezivanje iz jedne skupine (samo C, prvi glas): jedan par s glasom, ostali iz drugih skupina (slozi u vrste.ts).
  if (vrsta === "povezivanje" && r.length > 1 && new Set(r.map((x) => K(x.skupina[0]))).size < 2) {
    const redova = 1 + Math.min(n - 1, velike.filter((g) => K(g[0]) !== K(r[0].skupina[0])).length);
    return { redova, mogucih: redova, prazni };
  }
  return { redova: r.length, mogucih: r.length, prazni };
}

/** Gdje je glas: koliko riječi ima glas točno jednom na početku, u sredini i na kraju (isto kao `slozPozicije`). */
export function poPozicijama(rijeci: RijecGlasova[], glas: string): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (const r of rijeci) { const p = pozicijaGlasa(glas, r.rijec); if (p !== null) out[p]++; }
  return out;
}

/** Prvi glas: koliko riječi počinje svakim slovom (slova kao u abecedi kola: LJ, DŽ…). */
export function poPrvomGlasu(rijeci: RijecGlasova[], slova: string[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(slova.map((s) => [s, 0]));
  for (const r of rijeci) {
    if (/[\s-]/.test(r.rijec.trim())) continue;
    const p = fonemi(r.rijec)[0];
    if (p && p in out) out[p]++;
  }
  return out;
}
