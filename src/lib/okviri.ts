// Okviri radnih listića (docs/okviri.md): rub s uzorkom, mašna gore i ukrasi u kutovima.
// Okvir se bira po zadatku (`zadaci.okvir`, migracija 0030). Isti slojevi (pravokutnici uzorka,
// bijela kartica, slike ukrasa) crtaju PDF (ispis-pdf.ts) i HTML pregled ispisa (zadaci/klijent.ts),
// a `podrucje` daje prostor za zadatak unutar okvira. Sve mjere su u mm na A4 (210 × 297).
//
// Čisti TS, bez DOM-a: koriste ga poslužitelj, editor, PDF i testovi.

export type Rub = "bez" | "kocke-crvene" | "kocke-zelene" | "pruge-zelene" | "prugice-crvene";
export type Masna = "crvena" | "zelena";
export type Ukras = "medo" | "konjic" | "medenjak" | "grancica" | "drvce" | "praporci" | "snjegovic" | "auto" | "vrtuljak" | "imela";
/** Kutovi redom: gore lijevo, gore desno, dolje lijevo, dolje desno. */
export type Kutovi = [Ukras | null, Ukras | null, Ukras | null, Ukras | null];
export interface Okvir { rub: Rub; masna: Masna | null; kutovi: Kutovi }

export const RUBOVI: Record<Rub, string> = {
  bez: "Bez ruba", "kocke-crvene": "Kockice crveno-bijele", "kocke-zelene": "Kockice zeleno-bijele",
  "pruge-zelene": "Pruge zeleno-bijele", "prugice-crvene": "Prugice crveno-bijele",
};
export const MASNE: Record<Masna, string> = { crvena: "Crvena mašna", zelena: "Zelena mašna" };
export const UKRASI: Record<Ukras, string> = {
  medo: "Medvjedić", konjic: "Konjić za ljuljanje", medenjak: "Medenjak", grancica: "Grančica jele", drvce: "Okićeno drvce",
  praporci: "Zlatni praporci", snjegovic: "Snjegović", auto: "Auto s borom i poklonima", vrtuljak: "Božićni vrtuljak", imela: "Imela",
};
export const KUTOVI = ["Gore lijevo", "Gore desno", "Dolje lijevo", "Dolje desno"] as const;

export const BEZ_OKVIRA: Okvir = { rub: "bez", masna: null, kutovi: [null, null, null, null] };
/** Gotovi okviri (iz Anitine skice); „složi sam” mijenja bilo koji dio. */
export const GOTOVI: { kod: string; naziv: string; okvir: Okvir }[] = [
  { kod: "jednostavni", naziv: "Jednostavni", okvir: { rub: "bez", masna: "crvena", kutovi: [null, null, "grancica", "medenjak"] } },
  { kod: "kockice", naziv: "Kockice", okvir: { rub: "kocke-crvene", masna: null, kutovi: ["grancica", "medo", "konjic", "medenjak"] } },
  { kod: "pruge", naziv: "Pruge", okvir: { rub: "pruge-zelene", masna: "crvena", kutovi: [null, null, "medenjak", "medo"] } },
];

const jeRub = (x: unknown): x is Rub => typeof x === "string" && x in RUBOVI;
const jeMasna = (x: unknown): x is Masna => typeof x === "string" && x in MASNE;
const jeUkras = (x: unknown): x is Ukras => typeof x === "string" && x in UKRASI;

/** Okvir iz JSON-a (baza, editor); sve nepoznato postaje „bez”. */
export function normalizirajOkvir(x: unknown): Okvir {
  const o = (typeof x === "string" ? (() => { try { return JSON.parse(x); } catch { return null; } })() : x) as Partial<Okvir> | null;
  if (!o || typeof o !== "object") return { ...BEZ_OKVIRA, kutovi: [...BEZ_OKVIRA.kutovi] };
  const k = Array.isArray(o.kutovi) ? o.kutovi : [];
  return {
    rub: jeRub(o.rub) ? o.rub : "bez",
    masna: jeMasna(o.masna) ? o.masna : null,
    kutovi: [0, 1, 2, 3].map((i) => (jeUkras(k[i]) ? k[i] : null)) as Kutovi,
  };
}
export const imaOkvir = (o: Okvir | null | undefined): o is Okvir => !!o && (o.rub !== "bez" || !!o.masna || o.kutovi.some(Boolean));
export const isti = (a: Okvir, b: Okvir) => JSON.stringify(a) === JSON.stringify(b);

/** Slika ukrasa (public/okviri, PNG s prozirnošću). */
export const urlUkrasa = (ime: Ukras | `masna-${Masna}`) => `/okviri/${ime}.png`;
export const jeUkrasUrl = (url: string) => url.startsWith("/okviri/");

// ---- Geometrija ----

export const A4 = { w: 210, h: 297 } as const;
/** Uzorak ide do 5 mm od ruba papira (kućni pisači ne ispisuju do ruba); bijela kartica od 14 mm. */
const VANI = 5, KARTICA = 14;
const KUT = 28, MASNA = { x: 86, y: 3, w: 38, h: 26 };

/**
 * Prostor za zadatak (mm): lijevo/desno, vrh zaglavlja, dno sadržaja i podnožje. `sredina`: zaglavlje
 * centrirano i uže (ukrasi u gornjim kutovima ili mašna), kao na bilježnici s grančicama.
 */
export interface Podrucje { L: number; D: number; vrh: number; dno: number; podnozjeY: number; sredina: boolean }
export function podrucje(o: Okvir | null | undefined): Podrucje {
  if (!imaOkvir(o)) return { L: 15, D: A4.w - 15, vrh: 16, dno: A4.h - 18, podnozjeY: A4.h - 10, sredina: false };
  const gore = !!o.kutovi[0] || !!o.kutovi[1], dolje = !!o.kutovi[2] || !!o.kutovi[3];
  return {
    L: 20, D: A4.w - 20,
    vrh: o.masna ? MASNA.y + MASNA.h + 2 : gore ? 24 : 21,
    dno: A4.h - (dolje ? 35 : 22),
    podnozjeY: A4.h - 19,
    sredina: !!o.masna || gore,
  };
}

export interface Pravokutnik { x: number; y: number; w: number; h: number; boja: string; prozirnost: number }
export interface SlikaOkvira { url: string; x: number; y: number; w: number; h: number }
export interface Slojevi { uzorak: Pravokutnik[]; kartica: { x: number; y: number; w: number; h: number; r: number } | null; slike: SlikaOkvira[] }

/** Boje uzorka: svijetle, da rub ne troši puno tinte. */
const UZORCI: Record<Exclude<Rub, "bez">, { boja: string; prozirnost: number; sirina: number; korak: number; kocke: boolean }> = {
  "kocke-crvene": { boja: "#d9483b", prozirnost: 0.32, sirina: 5, korak: 10, kocke: true },
  "kocke-zelene": { boja: "#4f8a5b", prozirnost: 0.32, sirina: 5, korak: 10, kocke: true },
  "pruge-zelene": { boja: "#a9c9a4", prozirnost: 1, sirina: 6, korak: 12, kocke: false },
  "prugice-crvene": { boja: "#e8857c", prozirnost: 1, sirina: 2.5, korak: 5, kocke: false },
};

/** Slojevi okvira odozdo prema gore: uzorak, bijela kartica, ukrasi. */
export function slojevi(o: Okvir | null | undefined): Slojevi {
  const out: Slojevi = { uzorak: [], kartica: null, slike: [] };
  if (!imaOkvir(o)) return out;
  if (o.rub !== "bez") {
    const u = UZORCI[o.rub];
    const W = A4.w - 2 * VANI, H = A4.h - 2 * VANI;
    // Okomite pruge (i kod pruga i kod kockica), poravnate na sredinu stranice da rub bude simetričan.
    const pomak = ((A4.w / 2 - u.sirina / 2 - VANI) % u.korak + u.korak) % u.korak;
    for (let x = VANI + pomak - u.korak; x < VANI + W; x += u.korak) {
      const x0 = Math.max(VANI, x), x1 = Math.min(VANI + W, x + u.sirina);
      if (x1 > x0) out.uzorak.push({ x: x0, y: VANI, w: x1 - x0, h: H, boja: u.boja, prozirnost: u.prozirnost });
    }
    if (u.kocke) {
      const pomakY = ((A4.h / 2 - u.sirina / 2 - VANI) % u.korak + u.korak) % u.korak;
      for (let y = VANI + pomakY - u.korak; y < VANI + H; y += u.korak) {
        const y0 = Math.max(VANI, y), y1 = Math.min(VANI + H, y + u.sirina);
        if (y1 > y0) out.uzorak.push({ x: VANI, y: y0, w: W, h: y1 - y0, boja: u.boja, prozirnost: u.prozirnost });
      }
    }
    out.kartica = { x: KARTICA, y: KARTICA, w: A4.w - 2 * KARTICA, h: A4.h - 2 * KARTICA, r: 5 };
  }
  const mjesta = [[6, 6], [A4.w - 6 - KUT, 6], [6, A4.h - 6 - KUT], [A4.w - 6 - KUT, A4.h - 6 - KUT]] as const;
  o.kutovi.forEach((k, i) => { if (k) out.slike.push({ url: urlUkrasa(k), x: mjesta[i][0], y: mjesta[i][1], w: KUT, h: KUT }); });
  if (o.masna) out.slike.push({ url: urlUkrasa(`masna-${o.masna}`), ...MASNA });
  return out;
}

/** Isti slojevi kao SVG (viewBox u mm) za HTML pregled ispisa. */
export function okvirSvg(o: Okvir | null | undefined): string {
  const s = slojevi(o);
  if (!s.uzorak.length && !s.slike.length) return "";
  const f = (n: number) => +n.toFixed(2);
  return `<svg class="a4-okvir-sloj" viewBox="0 0 ${A4.w} ${A4.h}" preserveAspectRatio="none" aria-hidden="true">`
    + s.uzorak.map((p) => `<rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h)}" fill="${p.boja}" fill-opacity="${p.prozirnost}"/>`).join("")
    + (s.kartica ? `<rect x="${s.kartica.x}" y="${s.kartica.y}" width="${s.kartica.w}" height="${s.kartica.h}" rx="${s.kartica.r}" fill="#fff" stroke="${RUB_KARTICE}" stroke-width="0.35"/>` : "")
    + s.slike.map((p) => `<image href="${p.url}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" preserveAspectRatio="xMidYMid meet"/>`).join("")
    + "</svg>";
}
export const RUB_KARTICE = "#8a6b4a";
