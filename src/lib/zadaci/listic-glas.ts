// Radni listić po glasovima: koje riječi ulaze. Isto pravilo u obrascu (broj slika uživo) i na
// poslužitelju (slaganje), pa broj na gumbu odgovara listiću.
import { fonemi } from "../fonemi.ts";
import { brojSlogova } from "./rima.ts";
import { kljuc, poCiljevima, type Odnos } from "./odnosi.ts";
import { MAX_PAROVA, MAX_REDOVA } from "./vrste.ts";

/** Riječ sa slikom i pojavama glasova iz kataloga (`rijec_glas`: id glasa, pozicija). */
export interface RijecGlasova { id: number; rijec: string; rima?: string | null; g: [number, string][] }
/**
 * `glasovi`: riječ ima barem jedan od njih na `pozicija` (prazno = bilo gdje); prazan popis = svaka riječ.
 * `bez`: nijedan od tih glasova nije nigdje u riječi (po fonemima: „bez L” ne izbacuje LJULJAČKU).
 */
export interface FiltarListica { glasovi: number[]; pozicija: string; bez: string[] }

export const POZICIJE_LISTICA: Record<string, string> = {
  "": "bilo gdje", inicijalna: "inicijalna pozicija", medijalna: "medijalna pozicija", finalna: "finalna pozicija", skupina: "skupine",
};

export function odgovara(r: RijecGlasova, f: FiltarListica): boolean {
  if (f.glasovi.length && !r.g.some(([g, p]) => f.glasovi.includes(g) && (!f.pozicija || p === f.pozicija))) return false;
  if (f.bez.length) {
    const ima = new Set(fonemi(r.rijec));
    if (f.bez.some((b) => ima.has(b))) return false;
  }
  return true;
}

/** „Glasovi L, R – inicijalna pozicija, bez Š” */
export function naslovListica(oznake: string[], pozicija: string, bez: string[]): string {
  const dijelovi: string[] = [];
  if (oznake.length) dijelovi.push(`${oznake.length > 1 ? "Glasovi" : "Glas"} ${oznake.join(", ")}${pozicija ? ` – ${POZICIJE_LISTICA[pozicija]}` : ""}`);
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
export const PO_GLASOVIMA = ["listic", "slogovi", "odabir", "povezivanje", "uljez", "prvi_glas"] as const;
export type VrstaPoGlasovima = (typeof PO_GLASOVIMA)[number];
export const jePoGlasovima = (v: string): v is VrstaPoGlasovima => (PO_GLASOVIMA as readonly string[]).includes(v);
/** Zadaci odnosa (rima, prvi glas…) uzimaju riječi do 3 sloga (isto kao poslužitelj: `maxSlogova`). */
export const RIMA_MAX_SLOGOVA = 3;

/**
 * Koliko građe ima predložak za filtar: listić i prebrajanje broje riječi s glasom; uparivanje i povezivanje
 * skupine odnosa (iste rime, istog prvog glasa…; 2+ riječi) u kojima je barem jedna s glasom, uljez takve
 * skupine od 3+. `bez` vrijedi za sve riječi.
 */
export function moguce(vrsta: Exclude<VrstaPoGlasovima, "prvi_glas">, rijeci: RijecGlasova[], f: FiltarListica, odnos: Odnos = "rima"): number {
  if (vrsta === "listic" || vrsta === "slogovi") return rijeci.filter((r) => odgovara(r, f)).length;
  const K = (r: RijecGlasova) => kljuc(odnos, r);
  const sve = rijeci.filter((r) => K(r) && brojSlogova(r.rijec) <= RIMA_MAX_SLOGOVA && odgovara(r, { glasovi: [], pozicija: "", bez: f.bez }));
  const skupine = new Map<string, RijecGlasova[]>();
  for (const r of sve) skupine.set(K(r)!, [...(skupine.get(K(r)!) ?? []), r]);
  const najmanje = vrsta === "uljez" ? 3 : 2;
  return [...skupine.values()].filter((g) => g.length >= najmanje && g.some((r) => odgovara(r, f))).length;
}

export type VrstaOdnosa = "odabir" | "povezivanje" | "uljez";
/** Koliko redova (parova) po glasovima: po jedan za svaki odabrani glas, a barem 4 (s jednim glasom 4 reda tog glasa). */
export const redovaZaGlasove = (vrsta: VrstaOdnosa, glasova: number) =>
  Math.min(Math.max(glasova, 4), vrsta === "povezivanje" ? MAX_PAROVA : MAX_REDOVA);

/** Uvjet „riječ ima ovaj glas na poziciji” za svaki odabrani glas (redom kojim su odabrani). */
export const ciljeviGlasova = (f: FiltarListica) =>
  f.glasovi.map((g) => (r: RijecGlasova) => odgovara(r, { glasovi: [g], pozicija: f.pozicija, bez: [] }));

/**
 * Uparivanje, povezivanje, uljez po glasovima: koliko redova će biti i koji odabrani glasovi nemaju nijedan
 * (nema skupine odnosa s tim glasom). Bez odabranih glasova: 4 nasumične skupine.
 */
export function rasporedOdnosa(vrsta: VrstaOdnosa, rijeci: RijecGlasova[], f: FiltarListica, odnos: Odnos): { redova: number; mogucih: number; prazni: number[] } {
  const K = (r: RijecGlasova) => kljuc(odnos, r);
  const skupine = new Map<string, RijecGlasova[]>();
  for (const r of rijeci) if (K(r) && brojSlogova(r.rijec) <= RIMA_MAX_SLOGOVA && odgovara(r, { glasovi: [], pozicija: "", bez: f.bez })) skupine.set(K(r)!, [...(skupine.get(K(r)!) ?? []), r]);
  const velike = [...skupine.values()].filter((g) => g.length >= (vrsta === "uljez" ? 3 : 2));
  if (!f.glasovi.length) return { redova: Math.min(velike.length, 4), mogucih: velike.length, prazni: [] };
  const r = poCiljevima(velike, ciljeviGlasova(f), redovaZaGlasove(vrsta, f.glasovi.length));
  return { redova: r.length, mogucih: r.length, prazni: f.glasovi.filter((_, i) => !r.some((x) => x.cilj === i)) };
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
