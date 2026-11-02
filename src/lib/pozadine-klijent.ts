// Provjera slika pozadine u pregledniku prije slanja (server provjerava isto u pozadine.ts).
// Pregled ide kroz data: URL jer CSP na produkciji nema blob: u img-src.

export const MAX_BAJTOVA = 8 * 1024 * 1024;
export const MIN_STRANA = 600;
const TIPOVI = ["image/png", "image/jpeg", "image/webp"];

export interface StavkaDatoteke { ime: string; url: string | null; orijentacija: "uspravno" | "vodoravno" | null; opis: string }

const procitaj = (f: File) => new Promise<string>((ok, ne) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => ne(r.error);
  r.readAsDataURL(f);
});
const velicina = (url: string) => new Promise<{ w: number; h: number }>((ok, ne) => {
  const i = new Image();
  i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight });
  i.onerror = () => ne(new Error("slika se ne da otvoriti"));
  i.src = url;
});

export async function provjeriDatoteke(datoteke: File[]): Promise<{ greske: string[]; stavke: StavkaDatoteke[] }> {
  const greske: string[] = [];
  const stavke: StavkaDatoteke[] = [];
  if (datoteke.length > 2) greske.push("Najviše dvije slike: jedna uspravna i jedna vodoravna.");
  const orijentacije = new Map<string, string>();
  for (const f of datoteke.slice(0, 2)) {
    if (!TIPOVI.includes(f.type)) { greske.push(`${f.name}: samo PNG, JPEG ili WebP.`); stavke.push({ ime: f.name, url: null, orijentacija: null, opis: `${f.name}: nepodržan tip` }); continue; }
    if (f.size > MAX_BAJTOVA) { greske.push(`${f.name}: veća od 8 MB.`); stavke.push({ ime: f.name, url: null, orijentacija: null, opis: `${f.name}: prevelika` }); continue; }
    try {
      const url = await procitaj(f);
      const { w, h } = await velicina(url);
      const o = h > w ? "uspravno" : "vodoravno";
      const omjer = Math.max(w, h) / Math.min(w, h);
      if (Math.min(w, h) < MIN_STRANA) greske.push(`${f.name}: premala (${w}×${h}), treba barem ${MIN_STRANA} px po kraćoj strani.`);
      if (omjer > 2.2) greske.push(`${f.name}: preuska (omjer ${omjer.toFixed(1)}:1); scena treba omjer ekrana, npr. 4:3 ili 3:4.`);
      if (w === h) greske.push(`${f.name}: kvadratna slika nema orijentaciju; izreži je na 4:3 ili 3:4.`);
      if (orijentacije.has(o)) greske.push(`${f.name} i ${orijentacije.get(o)} su obje ${o}: treba jedna uspravna i jedna vodoravna.`);
      orijentacije.set(o, f.name);
      stavke.push({ ime: f.name, url, orijentacija: o, opis: `${o === "uspravno" ? "Uspravna" : "Vodoravna"} · ${w}×${h} · ${(f.size / 1024 / 1024).toFixed(1)} MB` });
    } catch {
      greske.push(`${f.name}: ne mogu otvoriti sliku.`);
      stavke.push({ ime: f.name, url: null, orijentacija: null, opis: `${f.name}: neispravna` });
    }
  }
  return { greske, stavke };
}
