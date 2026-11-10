// Znakovi u katalogu: slova, brojke i simboli koji se u zadacima prikazuju kao znak, a ne kao slika
// (docs/katalog.md, „Znakovi”). Spremaju se u `rijeci` s `vrsta = 'znak'`, pa ih svaki zadatak
// referencira istim `rijec_id` kao sliku; za razliku od riječi nemaju glasove ni slike i ne idu
// u generator. Velika i mala slova su različiti znakovi (b i B), pa se `rijec` ne pretvara u mala slova.
//
// Čisti TS: koriste ga admin, editor zadatka, igra, PDF i testovi.

import { slug } from "./fonemi.ts";

/** Hrvatska abeceda velikim slovima (dvoslovi su jedno slovo). */
const ABECEDA_ZNAKOVA = ["A", "B", "C", "Č", "Ć", "D", "DŽ", "Đ", "E", "F", "G", "H", "I", "J", "K", "L", "LJ", "M", "N", "NJ", "O", "P", "R", "S", "Š", "T", "U", "V", "Z", "Ž"];
export const ZNAK_MAX = 3;

export type SkupinaZnaka = "veliko" | "malo" | "brojka" | "ostalo";
export const SKUPINE_ZNAKOVA: Record<SkupinaZnaka, string> = {
  veliko: "Velika slova", malo: "Mala slova", brojka: "Brojke", ostalo: "Ostali znakovi",
};

const VELIKO = (s: string) => s.toLocaleUpperCase("hr");
const MALO = (s: string) => s.toLocaleLowerCase("hr");

/** Velika slova, mala slova, brojke ili ostalo (W, Q, X i Y su slova, iako nisu u abecedi). */
export function skupinaZnaka(z: string): SkupinaZnaka {
  if (/^\p{N}+$/u.test(z)) return "brojka";
  if (!/^\p{L}+$/u.test(z)) return "ostalo";
  if (z === VELIKO(z) && z !== MALO(z)) return "veliko";
  if (z === MALO(z) && z !== VELIKO(z)) return "malo";
  return "ostalo";
}

/** Adresa znaka: `znak-b`, `znak-b-veliko`, `znak-dzh-veliko`, `znak-7`; ostali znakovi po kodu (`znak-u2b`). */
export function slugZnaka(z: string): string {
  const s = skupinaZnaka(z);
  if (s === "ostalo" && !/^\p{L}+$/u.test(z)) return `znak-${[...z].map((c) => `u${c.codePointAt(0)!.toString(16)}`).join("-")}`;
  return `znak-${slug(z)}${s === "veliko" || (s === "ostalo" && z !== MALO(z)) ? "-veliko" : ""}`;
}

/** Očisti unos: bez razmaka, NFC, do `ZNAK_MAX` znakova (DŽ je dva). Prazno ili predugo → null. */
export function normalizirajZnak(x: unknown): string | null {
  const z = String(x ?? "").normalize("NFC").replace(/\s+/g, "");
  if (!z || [...z].length > ZNAK_MAX) return null;
  return z;
}

/** Redoslijed: velika, mala, brojke, ostalo; slova po hrvatskoj abecedi (DŽ iza D), brojke po vrijednosti. */
export function usporediZnakove(a: string, b: string): number {
  const red: SkupinaZnaka[] = ["veliko", "malo", "brojka", "ostalo"];
  const sa = skupinaZnaka(a), sb = skupinaZnaka(b);
  if (sa !== sb) return red.indexOf(sa) - red.indexOf(sb);
  if (sa === "brojka") return Number(a) - Number(b);
  const ia = ABECEDA_ZNAKOVA.indexOf(VELIKO(a)), ib = ABECEDA_ZNAKOVA.indexOf(VELIKO(b));
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0 || ib >= 0) return ia >= 0 ? -1 : 1;
  return a.localeCompare(b, "hr");
}

/** Znakovi koje migracija 0026 upisuje: abeceda velikim i malim slovima te brojke 0–9. */
export const POCETNI_ZNAKOVI = [...ABECEDA_ZNAKOVA, ...ABECEDA_ZNAKOVA.map(MALO), ..."0123456789"];

/** Kako se znak ili riječ prikazuje: riječ velikim tiskanim slovima, znak točno kako je upisan. */
export const prikazRijeci = (r: { rijec: string; znak?: boolean }) => (r.znak ? r.rijec : VELIKO(r.rijec));
