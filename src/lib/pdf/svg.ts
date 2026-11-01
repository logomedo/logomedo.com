// Mali SVG → pdf-lib crtač za naše vlastite SVG-ove (bor, grančica): <g>, <path>, <rect>,
// <circle>; boja, obrub, debljina, crtkanje, kraj crte; klase kroz mapu stilova. Nije opći
// SVG parser: ne zna transform, gradijente ni tekst. Ostaje vektor, pa je ispis oštar.

import { concatTransformationMatrix, LineCapStyle, popGraphicsState, pushGraphicsState, rgb, type PDFPage, type RGB } from "pdf-lib";

type Atributi = Record<string, string>;

const atributi = (s: string): Atributi => {
  const a: Atributi = {};
  for (const m of s.matchAll(/([\w:-]+)="([^"]*)"/g)) a[m[1]] = m[2];
  return a;
};

export function boja(h: string): RGB | undefined {
  if (!h || h === "none") return undefined;
  let x = h.replace("#", "");
  if (x.length === 3) x = x.split("").map((c) => c + c).join("");
  return rgb(parseInt(x.slice(0, 2), 16) / 255, parseInt(x.slice(2, 4), 16) / 255, parseInt(x.slice(4, 6), 16) / 255);
}

const STIL = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap"];

/** Oblik elementa kao SVG path. */
function putanja(oznaka: string, a: Atributi): string | null {
  const n = (k: string) => Number(a[k] ?? 0);
  if (oznaka === "path") return a.d ?? null;
  if (oznaka === "circle") {
    const [cx, cy, r] = [n("cx"), n("cy"), n("r")];
    return `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
  }
  if (oznaka === "rect") {
    const [x, y, w, h] = [n("x"), n("y"), n("width"), n("height")];
    const r = Math.min(n("rx"), w / 2, h / 2);
    if (!r) return `M${x} ${y} H${x + w} V${y + h} H${x} Z`;
    return `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} ` +
      `H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
  }
  return null;
}

export interface SvgSmjestaj {
  /** Gornji lijevi kut u PDF točkama (y od dna stranice, kao u pdf-lib). */
  x: number; y: number;
  /** Širina u točkama; visina slijedi iz viewBoxa. */
  sirina: number;
  zrcaliX?: boolean; zrcaliY?: boolean;
  /** Stilovi po klasi (umjesto CSS-a stranice). */
  klase?: Record<string, Atributi>;
}

/** Omjer visina/širina iz viewBoxa. */
export function omjer(svg: string): number {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1].trim().split(/[\s,]+/).map(Number) ?? [0, 0, 1, 1];
  return vb[3] / vb[2];
}

export function nacrtajSvg(page: PDFPage, svg: string, o: SvgSmjestaj) {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1].trim().split(/[\s,]+/).map(Number) ?? [0, 0, 100, 100];
  const mj = o.sirina / vb[2];
  const visina = vb[3] * mj;
  // Zrcaljenje oko središta okvira; drawSvgPath ispod toga radi svoje (translate + scale).
  const zrcali = o.zrcaliX || o.zrcaliY;
  if (zrcali) {
    const sx = o.zrcaliX ? -1 : 1, sy = o.zrcaliY ? -1 : 1;
    const cx = o.x + o.sirina / 2, cy = o.y - visina / 2;
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx, 0, 0, sy, cx - sx * cx, cy - sy * cy));
  }
  const stog: Atributi[] = [{ fill: "#000" }];
  for (const m of svg.matchAll(/<(\/?)(\w+)([^>]*?)(\/?)>/g)) {
    const [, zatvara, oznaka, ostatak, samo] = m;
    if (oznaka === "svg") continue;
    if (zatvara) { if (oznaka === "g") stog.pop(); continue; }
    const a = atributi(ostatak);
    const roditelj = stog[stog.length - 1];
    const stil: Atributi = { ...roditelj };
    for (const k of (a.class ?? "").split(/\s+/)) Object.assign(stil, o.klase?.[k] ?? {});
    for (const k of STIL) if (a[k] !== undefined) stil[k] = a[k];
    if (oznaka === "g") { if (!samo) stog.push(stil); continue; }
    const d = putanja(oznaka, a);
    if (!d) continue;
    const ispuna = boja(stil.fill);
    const obrub = boja(stil.stroke ?? "none");
    const debljina = obrub ? Number(stil["stroke-width"] ?? 1) : 0;
    if (!ispuna && !obrub) continue;
    page.drawSvgPath(d, {
      x: o.x - vb[0] * mj, y: o.y + vb[1] * mj, scale: mj,
      color: ispuna,
      borderColor: obrub,
      borderWidth: debljina || undefined,
      borderDashArray: obrub && stil["stroke-dasharray"] ? stil["stroke-dasharray"].split(/[\s,]+/).map(Number) : undefined,
      borderLineCap: stil["stroke-linecap"] === "round" ? LineCapStyle.Round : undefined,
    });
  }
  if (zrcali) page.pushOperators(popGraphicsState());
}
