// Odnos između slika u uparivanju, povezivanju i izbacivanju uljeza (docs/zadaci.md, „Odnosi”).
// Vrsta je mehanika, odnos je ono što slike povezuje: rima, isti prvi glas, isti prvi slog, isti
// zadnji glas. Svaki odnos je ključ riječi: dvije riječi su u odnosu ako imaju isti ključ.
// „Riječ i slika” (ista_rijec): par je napisana riječ i slika iste riječi (napisano.ts); ključ je sama riječ,
// a dvije različite pojave iste riječi (slika 5 i napisano -5) su u odnosu.
// Kasnije mogu doći odnosi po značenju (životinja i hrana, suprotnosti); oni neće imati ključ iz
// pisanja, nego parove u katalogu.
//
// Čisti TS: koriste ga Worker, editor u pregledniku i testovi.

import { fonemi } from "../fonemi.ts";
import { jezgre } from "./rima.ts";
import { slogovi } from "./slogovi.ts";

export type Odnos = "rima" | "pocetni_glas" | "pocetni_slog" | "zavrsni_glas" | "ista_rijec";
export const ODNOSI_POPIS: Odnos[] = ["rima", "pocetni_glas", "pocetni_slog", "zavrsni_glas", "ista_rijec"];
/** Odnosi za vrstu: „Riječ i slika” nema uljeza (tri iste riječi nisu zadatak). */
export const odnosiZa = (v: "odabir" | "povezivanje" | "uljez"): Odnos[] => ODNOSI_POPIS.filter((o) => o !== "ista_rijec" || v !== "uljez");
export const jeOdnos = (x: unknown): x is Odnos => typeof x === "string" && (ODNOSI_POPIS as string[]).includes(x);

/** Riječ za odnos: `rijec` je zapis, `rima` ključ rime (ručni ili izveden). */
export interface RijecOdnosa { id: number; rijec: string; rima?: string | null }

const VELIKO = (s: string) => s.toLocaleUpperCase("hr");
/** Samo jedna riječ (izraz poput ČAROBNI ŠTAPIĆ nema „prvi slog”); rima gleda zadnju riječ izraza. */
const jedna = (s: string) => (/[\s-]/.test(s.trim()) ? null : VELIKO(s).replace(/[^A-ZČĆĐŠŽ]/g, "") || null);

/**
 * Prvi slog po pravilima rastavljanja (slogovi.ts): jednosložna riječ je cijela (LAV), slog može biti
 * zatvoren (MAČ-KA, MAJ-MUN, POŠ-TAR) ili otvoren (MA-MA, KO-ZA, RIJE-KA, I-GRA). Tako MAMA i MACA
 * dijele MA-, a MAČKA i MAJMUN ne.
 */
export function prviSlog(rijec: string): string | null {
  const s = jedna(rijec);
  if (!s || !jezgre(s).length) return null;
  return slogovi(s)[0];
}

/** Ključ riječi za odnos, ili null ako riječ nije za taj odnos. */
export function kljuc(odnos: Odnos, r: RijecOdnosa): string | null {
  switch (odnos) {
    case "rima": return r.rima || null;
    case "pocetni_glas": { const s = jedna(r.rijec); return s ? fonemi(s)[0] ?? null : null; }
    case "zavrsni_glas": { const s = jedna(r.rijec); return s ? fonemi(s).at(-1) ?? null : null; }
    case "pocetni_slog": return prviSlog(r.rijec);
    case "ista_rijec": return VELIKO(r.rijec.trim()) || null;
  }
}

/** Jesu li dvije (različite) riječi u odnosu. */
export const uOdnosu = (odnos: Odnos, a: RijecOdnosa, b: RijecOdnosa) => {
  if (a.id === b.id) return false;
  const k = kljuc(odnos, a);
  return !!k && k === kljuc(odnos, b);
};

/** Kratka oznaka ključa ispod slike u editoru: -ava, m-, ma-, -a. */
export function oznakaKljuca(odnos: Odnos, r: RijecOdnosa): string {
  if (odnos === "ista_rijec") return "";
  const k = kljuc(odnos, r)?.toLocaleLowerCase("hr");
  if (!k) return odnos === "rima" ? "bez rime" : "izraz";
  return odnos === "rima" || odnos === "zavrsni_glas" ? `-${k}` : `${k}-`;
}

/**
 * Tekstovi odnosa. `x`/`y` su imena riječi. Upute su zadane upute za papir i ekran (logoped ih može prepisati).
 */
export const ODNOSI: Record<Odnos, {
  naziv: string;            // gumb i izbornik
  skupina: string;          // „nema nijedne skupine ___ od 3 riječi”
  mnozina: string;          // „Poveži slike koje ___.”
  da: (x: string, y: string) => string;
  ne: (x: string, y: string) => string;
  daOstale: string;         // „Uljez X ___.”
  neSve: string;            // „Tri slike koje nisu uljez ___.”
  uputa: { odabir: string; povezivanje: string; uljez: string };
  oznakaTocno: string;      // na točnom slotu u editoru
  filtarDa: (x: string) => string;
  filtarNe: (x: string) => string;
}> = {
  rima: {
    naziv: "Rima", skupina: "rime", mnozina: "se rimuju",
    da: (x, y) => `${x} se rimuje s ${y}`, ne: (x, y) => `${x} se ne rimuje s ${y}`,
    daOstale: "se rimuje s ostalima", neSve: "se ne rimuju sve međusobno",
    uputa: { odabir: "Koja se slika rimuje s prvom? Zaokruži je.", povezivanje: "Poveži slike koje se rimuju.", uljez: "Koja se slika ne rimuje s ostalima? Prekriži je." },
    oznakaTocno: "rimuje se", filtarDa: (x) => `Rimuje se s ${x}`, filtarNe: (x) => `Ne rimuje se s ${x}`,
  },
  pocetni_glas: {
    naziv: "Isti prvi glas", skupina: "s istim prvim glasom", mnozina: "počinju istim glasom",
    da: (x, y) => `${x} počinje istim glasom kao ${y}`, ne: (x, y) => `${x} ne počinje istim glasom kao ${y}`,
    daOstale: "počinje istim glasom kao ostale", neSve: "ne počinju sve istim glasom",
    uputa: { odabir: "Koja slika počinje istim glasom kao prva? Zaokruži je.", povezivanje: "Poveži slike koje počinju istim glasom.", uljez: "Koja slika ne počinje istim glasom kao ostale? Prekriži je." },
    oznakaTocno: "isti prvi glas", filtarDa: (x) => `Počinje kao ${x}`, filtarNe: (x) => `Ne počinje kao ${x}`,
  },
  pocetni_slog: {
    naziv: "Isti prvi slog", skupina: "s istim prvim slogom", mnozina: "počinju istim slogom",
    da: (x, y) => `${x} počinje istim slogom kao ${y}`, ne: (x, y) => `${x} ne počinje istim slogom kao ${y}`,
    daOstale: "počinje istim slogom kao ostale", neSve: "ne počinju sve istim slogom",
    uputa: { odabir: "Koja slika počinje istim slogom kao prva? Zaokruži je.", povezivanje: "Poveži slike koje počinju istim slogom.", uljez: "Koja slika ne počinje istim slogom kao ostale? Prekriži je." },
    oznakaTocno: "isti prvi slog", filtarDa: (x) => `Isti prvi slog kao ${x}`, filtarNe: (x) => `Drugi prvi slog od ${x}`,
  },
  zavrsni_glas: {
    naziv: "Isti zadnji glas", skupina: "s istim zadnjim glasom", mnozina: "završavaju istim glasom",
    da: (x, y) => `${x} završava istim glasom kao ${y}`, ne: (x, y) => `${x} ne završava istim glasom kao ${y}`,
    daOstale: "završava istim glasom kao ostale", neSve: "ne završavaju sve istim glasom",
    uputa: { odabir: "Koja slika završava istim glasom kao prva? Zaokruži je.", povezivanje: "Poveži slike koje završavaju istim glasom.", uljez: "Koja slika ne završava istim glasom kao ostale? Prekriži je." },
    oznakaTocno: "isti zadnji glas", filtarDa: (x) => `Završava kao ${x}`, filtarNe: (x) => `Ne završava kao ${x}`,
  },
  ista_rijec: {
    naziv: "Riječ i slika", skupina: "riječi sa slikom", mnozina: "su ista riječ (napisana riječ i njezina slika)",
    da: (x, y) => `${x} je ista riječ kao ${y}`, ne: (x, y) => `${x} nije ista riječ kao ${y}`,
    daOstale: "je ista riječ kao ostale", neSve: "nisu sve ista riječ",
    uputa: { odabir: "Pročitaj riječ. Zaokruži sliku koja to prikazuje.", povezivanje: "Pročitaj riječi i poveži svaku s njezinom slikom.", uljez: "Pročitaj riječi. Koja ne pripada? Prekriži je." },
    oznakaTocno: "ista riječ", filtarDa: (x) => `Riječ ${x}`, filtarNe: (x) => `Nije ${x}`,
  },
};

/**
 * Redovi po odabranim glasovima: redom kroz glasove (C, S, Z, C, S, Z…), svakom glasu `velicina` još neiskorištenih
 * riječi iz skupine u kojoj je riječ s tim glasom, dok ne bude `n` redova ili nijedan glas više nema riječi. Skupina
 * se dijeli na više redova (17. 11. 2026.: uljez „Isti prvi glas” s C imao je samo jedan red, jer su sve riječi na C
 * jedna skupina), a neiskorištena skupina ima prednost pred već načetom. Red počinje riječju s glasom (zadana,
 * lijeva), ostala mjesta prvo dobiju riječi bez glasa, da riječi s glasom ostanu za sljedeće redove.
 * `cilj` je indeks glasa. Istim pravilom broji dijalog „Po glasovima…” i slaže poslužitelj (on skupine prije izmiješa).
 */
export function poCiljevima<T>(skupine: T[][], ciljevi: ((r: T) => boolean)[], n: number, velicina = 2): { skupina: T[]; cilj: number }[] {
  const out: { skupina: T[]; cilj: number }[] = [];
  // Po indeksu, ne po vrijednosti: „Riječ i slika” ima istu riječ dvaput u skupini.
  const slobodni = skupine.map((g) => g.map((_, i) => i));
  const koristeno = skupine.map(() => 0);
  while (out.length < n) {
    let dodano = false;
    for (let c = 0; c < ciljevi.length && out.length < n; c++) {
      const C = ciljevi[c];
      let j = -1;
      skupine.forEach((g, k) => {
        if (slobodni[k].length < velicina || !slobodni[k].some((i) => C(g[i]))) return;
        if (j < 0 || koristeno[k] < koristeno[j]) j = k;
      });
      if (j < 0) continue;
      const g = skupine[j], sl = slobodni[j];
      const prvi = sl.find((i) => C(g[i]))!;
      const ostali = [...sl.filter((i) => i !== prvi && !C(g[i])), ...sl.filter((i) => i !== prvi && C(g[i]))].slice(0, velicina - 1);
      const red = [prvi, ...ostali];
      slobodni[j] = sl.filter((i) => !red.includes(i));
      koristeno[j]++;
      out.push({ skupina: red.map((i) => g[i]), cilj: c }); dodano = true;
    }
    if (!dodano) break;
  }
  return out;
}

/** Je li uputa jedna od zadanih (pa je smije zamijeniti promjena odnosa). */
export const jeZadanaUputa = (t: string) => !t.trim() || ODNOSI_POPIS.some((o) => Object.values(ODNOSI[o].uputa).includes(t));
