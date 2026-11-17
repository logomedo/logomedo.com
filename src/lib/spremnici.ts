// Spremnici za razvrstavanje (vreća, košara, kutija): jednostavan SVG bez teksta, isti u editoru, HTML ispisu,
// igri i PDF-u (pdf/svg.ts zna path, rect, circle). Oznaka (slovo ili broj) se piše u bijeli krug `OZNAKA`
// posebno: u pregledniku kao <text>, u PDF-u fontom Andika. Bez generiranja slika (Vertex se plaća).

import type { TemaRazvrstavanja } from "./zadaci/vrste.ts";

/** viewBox spremnika: 100 × 100. */
export const SPREMNIK_VB = 100;
/** Krug za oznaku (u jedinicama viewBoxa). */
export const OZNAKA = { cx: 50, cy: 68, r: 19 } as const;

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

/** Veličina slova oznake u jedinicama viewBoxa: dvoslov (LJ) i dvoznamenkasti broj su manji. */
export const velicinaOznake = (oznaka: string) => ([...oznaka].length > 1 ? 21 : 28);

const bijeg = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Cijeli spremnik s oznakom (preglednik). `null` oznaka je upitnik. */
export function spremnikSvg(tema: TemaRazvrstavanja, oznaka: string | null): string {
  const t = oznaka ?? "?";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPREMNIK_VB} ${SPREMNIK_VB}" role="img" aria-label="${bijeg(t)}">${OBLICI[tema]}${KRUG}`
    + `<text x="${OZNAKA.cx}" y="${OZNAKA.cy}" text-anchor="middle" dominant-baseline="central" font-family="Andika, sans-serif" font-weight="700" font-size="${velicinaOznake(t)}" fill="#2b2118">${bijeg(t)}</text></svg>`;
}
