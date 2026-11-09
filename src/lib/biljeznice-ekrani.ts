// Ekrani bilježnice: svaka stavka odabira i uljeza je jedan ekran, povezivanje je jedan
// ekran, listić se u igri preskače. Broj ekrana = broj lampica na boru. Čisti TS: server
// (broj lampica, ispis), preglednik (igra) i testovi.
import { UPUTE_PERCEPCIJE, UPUTE_PRVOG_GLASA, UPUTE_SLOGOVA, type Slogovi, type SlikaSlogova, krugUIgri, type Krug, type PrviGlas, type Odabir, type Percepcija, type Povezivanje, type Sadrzaj, type Scena, type Uljez, type Vrsta } from "./zadaci/vrste.ts";

export interface ZadatakZaIgru { vrsta: Vrsta; uputa: string | null; sadrzaj: Sadrzaj }
export type Ekran =
  | { vrsta: "odabir"; uputa: string; stavka: Odabir["stavke"][0] }
  | { vrsta: "uljez"; uputa: string; stavka: Uljez["stavke"][0] }
  | { vrsta: "povezivanje"; uputa: string; s: Povezivanje }
  | { vrsta: "scena"; uputa: string; s: Scena }
  | { vrsta: "percepcija"; uputa: string; trazi: Percepcija["trazi"]; stavka: Percepcija["stavke"][0] }
  | { vrsta: "slogovi"; uputa: string; nacin: Slogovi["nacin"]; krugova: number; slike: SlikaSlogova[] }
  | { vrsta: "prvi_glas"; uputa: string; kolo: string[]; boje: PrviGlas["boje"]; krug: Krug };

const UPUTE: Record<Exclude<Vrsta, "listic" | "percepcija" | "prvi_glas" | "slogovi">, string> = {
  odabir: "Što se rimuje s riječi {zadana}?",
  uljez: "Koja se riječ ne rimuje s ostalima?",
  povezivanje: "Poveži riječi koje se rimuju.",
  scena: "Što sve pripada ovoj slici?",
};

export function ekrani(zadaci: ZadatakZaIgru[]): Ekran[] {
  const out: Ekran[] = [];
  for (const z of zadaci) {
    if (z.vrsta === "listic") continue;
    if (z.vrsta === "percepcija") {
      // Uputa za papir („Prekriži je.") ne odgovara ekranu, pa igra ima svoju.
      const s = z.sadrzaj as Percepcija;
      const uputa = !z.uputa?.trim() || z.uputa.trim() === UPUTE_PERCEPCIJE[s.trazi].ispis ? UPUTE_PERCEPCIJE[s.trazi].ekran : z.uputa.trim();
      for (const st of s.stavke) if (st.polja.every((p) => p.rijec_id !== null)) out.push({ vrsta: "percepcija", uputa, trazi: s.trazi, stavka: st });
      continue;
    }
    if (z.vrsta === "slogovi") {
      // Duljina: do 8 slika po ekranu (bojice gore). Analiza: jedna velika slika s krugovima po ekranu.
      const s = z.sadrzaj as Slogovi;
      const uputa = !z.uputa?.trim() || z.uputa.trim() === UPUTE_SLOGOVA[s.nacin].ispis ? UPUTE_SLOGOVA[s.nacin].ekran : z.uputa.trim();
      const pune = s.slike.filter((x) => x.rijec_id !== null);
      // 10 slika su 2 ekrana po 5, ne 8 + 2.
      const po = s.nacin === "duljina" ? Math.ceil(pune.length / Math.ceil(pune.length / 8)) : 1;
      for (let i = 0; i < pune.length; i += po) out.push({ vrsta: "slogovi", uputa, nacin: s.nacin, krugova: s.krugova, slike: pune.slice(i, i + po) });
      continue;
    }
    if (z.vrsta === "prvi_glas") {
      // Svaki krug je ekran: kolo, pa traženje. Uputa za papir („iz kruga”) se na ekranu zamijeni.
      const s = z.sadrzaj as PrviGlas;
      const uputa = !z.uputa?.trim() || z.uputa.trim() === UPUTE_PRVOG_GLASA.ispis ? UPUTE_PRVOG_GLASA.ekran : z.uputa.trim();
      for (const k of s.krugovi) if (krugUIgri(s, k)) out.push({ vrsta: "prvi_glas", uputa, kolo: s.kolo, boje: s.boje, krug: k });
      continue;
    }
    const uputa = z.uputa?.trim() || UPUTE[z.vrsta];
    if (z.vrsta === "odabir") {
      for (const s of (z.sadrzaj as Odabir).stavke) if (s.zadana !== null && s.ponudeno.every((x) => x !== null)) out.push({ vrsta: "odabir", uputa, stavka: s });
    } else if (z.vrsta === "uljez") {
      for (const s of (z.sadrzaj as Uljez).stavke) if (s.slike.every((x) => x !== null)) out.push({ vrsta: "uljez", uputa, stavka: s });
    } else if (z.vrsta === "scena") {
      // Scena bez pozadine ili bez ijedne točne slike nije spremna za igru.
      const s = z.sadrzaj as Scena;
      if (s.pozadina_id !== null && s.gumbi.some((g) => g.rijec_id !== null && g.tocno)) out.push({ vrsta: "scena", uputa, s });
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

