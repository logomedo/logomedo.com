// Ekrani bilježnice: svaka stavka odabira i uljeza je jedan ekran, povezivanje je jedan
// ekran, listić se u igri preskače. Broj ekrana = broj lampica na boru. Čisti TS: server
// (broj lampica, ispis), preglednik (igra) i testovi.
import type { Odabir, Povezivanje, Sadrzaj, Uljez, Vrsta } from "./zadaci/vrste.ts";

export interface ZadatakZaIgru { vrsta: Vrsta; uputa: string | null; sadrzaj: Sadrzaj }
export type Ekran =
  | { vrsta: "odabir"; uputa: string; stavka: Odabir["stavke"][0] }
  | { vrsta: "uljez"; uputa: string; stavka: Uljez["stavke"][0] }
  | { vrsta: "povezivanje"; uputa: string; s: Povezivanje };

const UPUTE: Record<Exclude<Vrsta, "listic">, string> = {
  odabir: "Što se rimuje s riječi {zadana}?",
  uljez: "Koja se riječ ne rimuje s ostalima?",
  povezivanje: "Poveži riječi koje se rimuju.",
};

export function ekrani(zadaci: ZadatakZaIgru[]): Ekran[] {
  const out: Ekran[] = [];
  for (const z of zadaci) {
    if (z.vrsta === "listic") continue;
    const uputa = z.uputa?.trim() || UPUTE[z.vrsta];
    if (z.vrsta === "odabir") {
      for (const s of (z.sadrzaj as Odabir).stavke) if (s.zadana !== null && s.ponudeno.every((x) => x !== null)) out.push({ vrsta: "odabir", uputa, stavka: s });
    } else if (z.vrsta === "uljez") {
      for (const s of (z.sadrzaj as Uljez).stavke) if (s.slike.every((x) => x !== null)) out.push({ vrsta: "uljez", uputa, stavka: s });
    } else {
      const s = z.sadrzaj as Povezivanje;
      if (s.parovi.length && s.parovi.every((p) => p.lijevo !== null && p.desno !== null)) out.push({ vrsta: "povezivanje", uputa, s });
    }
  }
  return out;
}

export const brojEkrana = (zadaci: ZadatakZaIgru[]) => ekrani(zadaci).length;

/** Uputa s riječju umjesto {zadana} (velikim slovima). */
export const uputaZa = (uputa: string, zadana: string | null) =>
  uputa.replaceAll("{zadana}", (zadana ?? "").toLocaleUpperCase("hr")).replace(/\s+\?/, "?");

