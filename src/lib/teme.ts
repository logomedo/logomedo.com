// Teme bilježnica: izgled igre (pozadina, ukras koji broji riješene ekrane) i naslovnica ispisa.
// Ukras ima N „lampica” (bor: lampice, jabuka: plodovi) s istim razredima, pa igra ne zna temu.
import { borSvg } from "./bor.ts";
import { jabukaSvg, JABUKA_ISPIS_STIL } from "./jabuka.ts";
import { BOR_ISPIS_STIL } from "./ukrasi.ts";
import { borIgraSvg, jabukaIgraSvg } from "./stabla-igre.ts";

export type Tema = "bozic" | "proljece";

export interface OpisTeme {
  naziv: string;
  opis: string;
  /** Crtež za ispis (obrisi za bojanje). */
  ukras: (n: number, o?: { zaIspis?: boolean }) => string;
  /** Ukras u igri: ilustracija stabla s N lampica (src/lib/stabla-igre.ts). */
  ukrasIgre: (n: number) => string;
  ispisStil: Record<string, Record<string, string>>;
  /** Grančice jele u kutovima stranica ispisa. */
  kutovi: boolean;
  /** Što se pali: „lampica”, „jabuka”. */
  jedinica: [jedna: string, vise: string];
  uputaIspisa: string;
  kraj: string;
  boja: string;
}

export const TEME: Record<Tema, OpisTeme> = {
  bozic: {
    naziv: "Božić", opis: "Zimsko selo u sumrak, snijeg i bor; svaki riješen ekran pali lampicu.",
    ukras: borSvg, ukrasIgre: borIgraSvg, ispisStil: BOR_ISPIS_STIL, kutovi: true, jedinica: ["lampica", "lampica"],
    uputaIspisa: "Za svaki točno riješen red oboji jednu lampicu na boru.", kraj: "Bravo! Sve lampice svijetle.", boja: "#1b2a5c",
  },
  proljece: {
    naziv: "Proljeće", opis: "Sunčana livada i stablo jabuke; svaki riješen ekran pocrveni jednu jabuku na stablu.",
    ukras: jabukaSvg, ukrasIgre: jabukaIgraSvg, ispisStil: JABUKA_ISPIS_STIL, kutovi: false, jedinica: ["jabuka", "jabuka"],
    uputaIspisa: "Za svaki točno riješen red oboji jednu jabuku na stablu.", kraj: "Bravo! Sve jabuke su zrele.", boja: "#3f8f4e",
  },
};

export const jeTema = (t: unknown): t is Tema => typeof t === "string" && t in TEME;
