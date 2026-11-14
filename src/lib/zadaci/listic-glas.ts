// Radni listić po glasovima: koje riječi ulaze. Isto pravilo u obrascu (broj slika uživo) i na
// poslužitelju (slaganje), pa broj na gumbu odgovara listiću.
import { fonemi } from "../fonemi.ts";

/** Riječ sa slikom i pojavama glasova iz kataloga (`rijec_glas`: id glasa, pozicija). */
export interface RijecGlasova { id: number; rijec: string; g: [number, string][] }
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
