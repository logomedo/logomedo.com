// Podjele suglasnika za logopede (gramatika.hr, „Podjela glasova”): po mjestu tvorbe, načinu tvorbe i zvučnosti.
// Fonetika se ne mijenja, pa je u kodu, ne u bazi. Katalog slaže mape glasova po odabranoj podjeli (zadano mjesto).
// Čisti TS: katalog, predlošci i testovi.

export type Podjela = "mjesto" | "nacin" | "zvucnost";
export interface Skupina { kod: string; naziv: string; opis: string; glasovi: string[] }

export const PODJELE: Record<Podjela, { naziv: string; skupine: Skupina[] }> = {
  mjesto: {
    naziv: "Mjesto tvorbe",
    skupine: [
      { kod: "bilabijali", naziv: "Bilabijali", opis: "dvousneni", glasovi: ["B", "P", "M"] },
      { kod: "labiodentali", naziv: "Labiodentali", opis: "usneno-zubni", glasovi: ["V", "F"] },
      { kod: "dentali", naziv: "Dentali", opis: "zubni", glasovi: ["T", "D", "N", "C", "Z", "S"] },
      { kod: "alveolari", naziv: "Alveolari", opis: "desni", glasovi: ["L", "R"] },
      { kod: "palatali", naziv: "Palatali", opis: "nepčani", glasovi: ["J", "LJ", "NJ", "Š", "Ž", "Č", "Ć", "DŽ", "Đ"] },
      { kod: "velari", naziv: "Velari", opis: "jedreni", glasovi: ["K", "G", "H"] },
    ],
  },
  nacin: {
    naziv: "Način tvorbe",
    skupine: [
      { kod: "okluzivi", naziv: "Okluzivi", opis: "praskavi", glasovi: ["P", "B", "T", "D", "K", "G"] },
      { kod: "frikativi", naziv: "Frikativi", opis: "tjesnačni", glasovi: ["S", "Z", "Š", "Ž", "F", "H"] },
      { kod: "afrikate", naziv: "Afrikate", opis: "sliveni", glasovi: ["C", "Č", "Ć", "DŽ", "Đ"] },
      { kod: "sonanti", naziv: "Sonanti", opis: "", glasovi: ["M", "N", "NJ", "L", "LJ", "R", "V", "J"] },
    ],
  },
  zvucnost: {
    naziv: "Zvučnost",
    skupine: [
      { kod: "zvucni", naziv: "Zvučni", opis: "", glasovi: ["B", "D", "G", "Z", "Ž", "DŽ", "Đ"] },
      { kod: "bezvucni", naziv: "Bezvučni", opis: "", glasovi: ["P", "T", "K", "S", "Š", "C", "Č", "Ć", "F", "H"] },
      // Sonanti su zvučni, ali nemaju bezvučni par, pa nisu ni u jednoj od dviju skupina.
      { kod: "sonanti", naziv: "Sonanti", opis: "bez bezvučnog para", glasovi: ["M", "N", "NJ", "L", "LJ", "R", "V", "J"] },
    ],
  },
};

export const PODJELA_ZADANO: Podjela = "mjesto";
export const jePodjela = (x: unknown): x is Podjela => x === "mjesto" || x === "nacin" || x === "zvucnost";

/** Svi suglasnici, redom po mjestu tvorbe (25). */
export const SUGLASNICI = PODJELE.mjesto.skupine.flatMap((s) => s.glasovi);

/**
 * Glasovi kataloga složeni po podjeli: skupine redom kako su zadane, glas unutar skupine redom iz popisa.
 * Glas kojeg nema ni u jednoj skupini (samoglasnik) ide u „Ostalo” na kraju; prazne skupine se ne vraćaju.
 */
export function poPodjeli<T extends { oznaka: string }>(glasovi: T[], podjela: Podjela): { skupina: Skupina; glasovi: T[] }[] {
  const po = new Map(glasovi.map((g) => [g.oznaka, g]));
  const out = PODJELE[podjela].skupine.map((s) => ({ skupina: s, glasovi: s.glasovi.flatMap((o) => (po.has(o) ? [po.get(o)!] : [])) }));
  const svi = new Set(PODJELE[podjela].skupine.flatMap((s) => s.glasovi));
  const ostalo = glasovi.filter((g) => !svi.has(g.oznaka));
  if (ostalo.length) out.push({ skupina: { kod: "ostalo", naziv: "Ostalo", opis: "", glasovi: ostalo.map((g) => g.oznaka) }, glasovi: ostalo });
  return out.filter((x) => x.glasovi.length);
}

/** Skupine glasa u svakoj podjeli: { mjesto: Dentali, nacin: Frikativi, zvucnost: Bezvučni }; samoglasnik nema nijednu. */
export function skupineGlasa(oznaka: string): Partial<Record<Podjela, Skupina>> {
  const out: Partial<Record<Podjela, Skupina>> = {};
  for (const [p, d] of Object.entries(PODJELE) as [Podjela, (typeof PODJELE)[Podjela]][]) {
    const s = d.skupine.find((x) => x.glasovi.includes(oznaka));
    if (s) out[p] = s;
  }
  return out;
}
