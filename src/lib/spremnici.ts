// Spremnici za razvrstavanje (vreća, košara, kutija): slika iz Vertexa u stilu `ilustracija`
// (scripts/spremnici-slike.sh → spremnici-obrada.py → public/spremnici/<tema>.png) s praznim bijelim krugom
// na prednjoj strani. Oznaka (slovo ili broj) se piše u taj krug: u pregledniku kao <text> u SVG-u preko slike,
// u PDF-u fontom Andika. Isto u editoru, HTML ispisu, igri i PDF-u. Ako slika ne stigne, PDF crta
// jednostavan vektorski oblik (`spremnikOblik`, pdf/svg.ts zna path, rect, circle).

import type { TemaRazvrstavanja } from "./zadaci/vrste.ts";

/** viewBox spremnika: 100 × 100 (slika je kvadrat 480 px, pa su postoci isto što i jedinice). */
export const SPREMNIK_VB = 100;
/** Krug za oznaku u vektorskom obliku (rezerva za PDF). */
export const OZNAKA = { cx: 50, cy: 68, r: 19 } as const;
/** Slika i bijeli krug na njoj (izmjerio spremnici-obrada.py, % stranice). */
export const SPREMNICI: Record<TemaRazvrstavanja, { src: string; oznaka: { cx: number; cy: number; r: number } }> = {
  vrece: { src: "/spremnici/vrece.png", oznaka: { cx: 49.9, cy: 63.2, r: 19.3 } },
  kosare: { src: "/spremnici/kosare.png", oznaka: { cx: 49.8, cy: 71.4, r: 16.4 } },
  kutije: { src: "/spremnici/kutije.png", oznaka: { cx: 49.8, cy: 66.9, r: 18.7 } },
};

const OBLICI: Record<TemaRazvrstavanja, string> = {
  // Božićna vreća: crvena, vezana zlatnom vrpcom, bijeli rub na vratu.
  vrece: `<path d="M22 94C6 82 8 52 30 38L70 38C92 52 94 82 78 94Z" fill="#d94b3d" stroke="#7a1f16" stroke-width="2.5"/>`
    + `<path d="M34 38L38 22L62 22L66 38Z" fill="#d94b3d" stroke="#7a1f16" stroke-width="2.5"/>`
    + `<path d="M36 24C42 18 58 18 64 24L62 28C56 24 44 24 38 28Z" fill="#ffffff" stroke="#7a1f16" stroke-width="1.5"/>`
    + `<path d="M33 37L67 37L67 42L33 42Z" fill="#f2c14e" stroke="#8a6a12" stroke-width="1.5"/>`
    + `<path d="M50 40C42 30 34 34 40 42ZM50 40C58 30 66 34 60 42Z" fill="#f2c14e" stroke="#8a6a12" stroke-width="1.5"/>`,
  // Košara: pleter s ručkom.
  kosare: `<path d="M22 46C22 6 78 6 78 46" fill="none" stroke="#8b5a2b" stroke-width="5" stroke-linecap="round"/>`
    + `<path d="M8 44L92 44L82 94L18 94Z" fill="#d9a25f" stroke="#6b4420" stroke-width="2.5"/>`
    + `<path d="M11 58L89 58M14 72L86 72M16 86L84 86" fill="none" stroke="#6b4420" stroke-width="1.5"/>`
    + `<path d="M6 40L94 40L94 48L6 48Z" fill="#b97a3a" stroke="#6b4420" stroke-width="2.5"/>`,
  // Kutija: kartonska, s poklopcem.
  kutije: `<path d="M12 42L88 42L88 94L12 94Z" fill="#7fb3e0" stroke="#2c5d8a" stroke-width="2.5"/>`
    + `<path d="M6 30L94 30L94 44L6 44Z" fill="#5d9bd3" stroke="#2c5d8a" stroke-width="2.5"/>`
    + `<path d="M44 30L56 30L56 44L44 44Z" fill="#f2c14e" stroke="#8a6a12" stroke-width="1.5"/>`,
};

/** Krug oznake (bijeli, s obrubom). */
const KRUG = `<circle cx="${OZNAKA.cx}" cy="${OZNAKA.cy}" r="${OZNAKA.r}" fill="#ffffff" stroke="#2b2118" stroke-width="2"/>`;

/** Oblik spremnika s krugom za oznaku, bez teksta (za PDF). */
export const spremnikOblik = (tema: TemaRazvrstavanja) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPREMNIK_VB} ${SPREMNIK_VB}">${OBLICI[tema]}${KRUG}</svg>`;

/** Veličina slova oznake u jedinicama viewBoxa za krug polumjera `r`: dvoslov (LJ) i dvoznamenkasti broj su manji. */
export const velicinaOznake = (oznaka: string, r: number = OZNAKA.r) => r * ([...oznaka].length > 1 ? 1.1 : 1.45);

const bijeg = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Cijeli spremnik s oznakom (preglednik): slika i slovo u njezinom bijelom krugu. `null` oznaka je upitnik. */
export function spremnikSvg(tema: TemaRazvrstavanja, oznaka: string | null): string {
  const t = oznaka ?? "?", { src, oznaka: o } = SPREMNICI[tema];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPREMNIK_VB} ${SPREMNIK_VB}" role="img" aria-label="${bijeg(t)}">`
    + `<image href="${src}" x="0" y="0" width="${SPREMNIK_VB}" height="${SPREMNIK_VB}"/>`
    + `<text x="${o.cx}" y="${o.cy}" text-anchor="middle" dominant-baseline="central" font-family="Andika, sans-serif" font-weight="700" font-size="${velicinaOznake(t, o.r).toFixed(1)}" fill="#2b2118">${bijeg(t)}</text></svg>`;
}
