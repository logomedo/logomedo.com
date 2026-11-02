// Jabuka (tema „proljeće”) kao SVG s N plodova u krošnji. Plod i ima id `lampica-i` i klasu
// `lampica` s istim dijelovima kao lampica bora (`sjaj`, `kugla`, `odsjaj`), pa igra pali
// plodove istim kodom; boje teme su u stranici. Za ispis plodovi su prazni krugovi za bojanje.

const BOJE = ["#e8443a", "#f4b63a", "#d93a5c", "#f08a2c", "#c92f2f", "#f6d04d"];
const CX = 200, CY = 185, RX = 158, RY = 128;

/** Točke unutar krošnje (elipsa), redovi odozgo, s razmakom koji primi svih N. */
function mjesta(n: number): { x: number; y: number }[] {
  if (n <= 0) return [];
  for (let razmak = 70; razmak >= 18; razmak -= 2) {
    const t: { x: number; y: number }[] = [];
    for (let red = 0, y = CY - RY + razmak * 0.7; y <= CY + RY - razmak * 0.5; y += razmak * 0.86, red++) {
      for (let x = CX - RX + (red % 2 ? razmak : razmak / 2); x <= CX + RX; x += razmak) {
        const d = ((x - CX) / (RX - 14)) ** 2 + ((y - CY) / (RY - 14)) ** 2;
        if (d <= 1) t.push({ x, y });
      }
    }
    if (t.length >= n) {
      // Ravnomjerno iz cijele krošnje, ne samo gornjih redova.
      return Array.from({ length: n }, (_, i) => t[Math.floor(((i + 0.5) * t.length) / n)]);
    }
  }
  return [];
}

export function jabukaSvg(n: number, o: { zaIspis?: boolean } = {}): string {
  const r = n > 24 ? 10 : 13;
  const plodovi = mjesta(n).map((t, i) => {
    const x = t.x.toFixed(1), y = t.y.toFixed(1);
    return o.zaIspis
      ? `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="#000" stroke-width="2"/>`
      : `<g id="lampica-${i}" class="lampica" style="--boja:${BOJE[i % BOJE.length]}">
           <circle cx="${x}" cy="${y}" r="${r + 9}" class="sjaj"/>
           <path d="M${x} ${(t.y - r).toFixed(1)} q2 -7 6 -9" class="peteljka"/>
           <circle cx="${x}" cy="${y}" r="${r}" class="kugla"/>
           <circle cx="${(t.x - r / 3).toFixed(1)}" cy="${(t.y - r / 3).toFixed(1)}" r="${(r / 4).toFixed(1)}" class="odsjaj"/>
         </g>`;
  }).join("");
  // Krošnja: valoviti obris oko elipse (jedan put, pa i na papiru nema unutarnjih crta).
  const k = 16, tocka = (u: number, f = 1) => [CX + RX * f * Math.cos(u), CY + RY * f * Math.sin(u)];
  const [x0, y0] = tocka(0);
  let d = `M${x0.toFixed(1)} ${y0.toFixed(1)}`;
  for (let i = 0; i < k; i++) {
    const [qx, qy] = tocka(((i + 0.5) * 2 * Math.PI) / k, 1.16), [x, y] = tocka(((i + 1) * 2 * Math.PI) / k);
    d += ` Q${qx.toFixed(1)} ${qy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  const oblaci = `<path d="${d} Z" class="krosnja"/>`;
  return `<svg viewBox="0 0 400 470" xmlns="http://www.w3.org/2000/svg" class="bor jabuka" role="img" aria-label="Jabuka s plodovima">
    <path d="M182 300 Q186 380 176 450 H226 Q214 380 220 300 Z" class="deblo"/>
    <path d="M200 330 Q170 300 140 296 M204 320 Q236 292 262 290" class="grana"/>
    ${oblaci}
    ${plodovi}
  </svg>`;
}

export const JABUKA_ISPIS_STIL: Record<string, Record<string, string>> = {
  krosnja: { fill: "#fff", stroke: "#000", "stroke-width": "2.5" },
  deblo: { fill: "#fff", stroke: "#000", "stroke-width": "2.5" },
  grana: { fill: "none", stroke: "#000", "stroke-width": "2.5" },
};
