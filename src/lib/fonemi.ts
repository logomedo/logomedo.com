// Hrvatski pravopis je fonemski: iz pisanja riječi može se izvesti koji glasovi su u
// njoj i na kojoj poziciji. Zamka su dvoslovi (LJ, NJ, DŽ): u LJULJAČKA nema glasa L,
// u KONJ nema N. Rezultat je prijedlog (rijec_glas.potvrdeno = 0); logoped ga potvrđuje.
//
// Čisti TS bez ovisnosti, da ga koriste i Worker i seed skripta (node --experimental-strip-types).

export type Pozicija = "inicijalna" | "medijalna" | "finalna" | "skupina";

export const POZICIJE: { kod: Pozicija; naziv: string }[] = [
  { kod: "inicijalna", naziv: "Inicijalna" },
  { kod: "medijalna", naziv: "Medijalna" },
  { kod: "finalna", naziv: "Finalna" },
  { kod: "skupina", naziv: "Konsonantske skupine" },
];

const DVOSLOVI = ["DŽ", "LJ", "NJ"];
const SAMOGLASNICI = new Set(["A", "E", "I", "O", "U"]);

/** Riječ u niz fonema: „LJULJAČKA” → LJ U LJ A Č K A. */
export function fonemi(rijec: string): string[] {
  const s = rijec.toLocaleUpperCase("hr").replace(/[^A-ZČĆĐŠŽ]/g, "");
  const out: string[] = [];
  for (let i = 0; i < s.length; ) {
    const d = s.slice(i, i + 2);
    if (DVOSLOVI.includes(d)) { out.push(d); i += 2; } else { out.push(s[i]); i += 1; }
  }
  return out;
}

/** Koliko fonema ima početna suglasnička skupina (do prvog samoglasnika). */
function pocetnaSkupina(f: string[]): number {
  const i = f.findIndex((g) => SAMOGLASNICI.has(g));
  return i === -1 ? f.length : i;
}

export interface Pojava { glas: string; pozicija: Pozicija }

/**
 * Sve pojave zadanih glasova. „Skupina” je pojava u početnoj suglasničkoj skupini
 * (KRASTAVAC, BRDO, CRV), samo za glasove iz `skupine`; tako je slagan i stari katalog,
 * gdje je R u skupini usred riječi (TORBA, VATRA) medijalna pozicija.
 */
export function pojave(rijec: string, glasovi: Iterable<string>, skupine: Iterable<string> = ["R"]): Pojava[] {
  const f = fonemi(rijec);
  const trazeni = new Set(glasovi);
  const sSkupinama = new Set(skupine);
  const out: Pojava[] = [];
  const vidjeno = new Set<string>();
  const skupina = pocetnaSkupina(f);
  f.forEach((g, i) => {
    if (!trazeni.has(g)) return;
    let pozicija: Pozicija;
    if (sSkupinama.has(g) && skupina >= 2 && i < skupina) pozicija = "skupina";
    else if (i === 0) pozicija = "inicijalna";
    else if (i === f.length - 1) pozicija = "finalna";
    else pozicija = "medijalna";
    const k = `${g}|${pozicija}`;
    if (!vidjeno.has(k)) { vidjeno.add(k); out.push({ glas: g, pozicija }); }
  });
  return out;
}

/** URL slug, jednoznačan: „KOŠ” → „kosh”, „KOS” → „kos”, „ČEŠALJ” → „cheshalj”. */
export function slug(s: string): string {
  return s
    .toLocaleLowerCase("hr")
    .replace(/č/g, "ch").replace(/ć/g, "cj").replace(/đ/g, "dj").replace(/š/g, "sh").replace(/ž/g, "zh")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Oznaka glasa iz unosa („k”, „ Dž ”) ili null ako to nije jedan hrvatski glas. */
export function oznakaGlasa(unos: string): string | null {
  const s = unos.trim().toLocaleUpperCase("hr");
  return /^(DŽ|LJ|NJ|[A-ZČĆĐŠŽ])$/.test(s) && !["Q", "W", "X", "Y"].includes(s) ? s : null;
}
