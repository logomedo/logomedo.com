// Božićni bor kao SVG s N lampica na girlandama. Lampica i ima id `lampica-i` i klasu
// `lampica`; upaljena dobiva klasu `upaljena` (stil je u stranici). Čisti TS: koriste ga
// igra u pregledniku i ispis na serveru (tamo lampice ostaju prazni krugovi za bojanje).

const BOJE = ["#ffcf4a", "#ff6b6b", "#7fd3ff", "#ffa94d", "#b197fc", "#8ce99a"];

/** Točke na girlandama: lukovi preko krošnje, odozgo prema dolje, ravnomjerno po duljini. */
function mjesta(n: number): { x: number; y: number }[] {
  // Svaki luk: od lijevog do desnog ruba sloja krošnje, blago prema dolje u sredini.
  const lukovi = [
    { y: 130, s: 36, p: 10 }, { y: 200, s: 62, p: 14 }, { y: 272, s: 90, p: 16 }, { y: 348, s: 120, p: 18 },
  ];
  const duljine = lukovi.map((l) => l.s * 2);
  const ukupno = duljine.reduce((a, b) => a + b, 0);
  const out: { x: number; y: number }[] = [];
  let preostalo = n;
  lukovi.forEach((l, i) => {
    const k = i === lukovi.length - 1 ? preostalo : Math.round((n * duljine[i]) / ukupno);
    const m = Math.min(k, preostalo);
    preostalo -= m;
    for (let j = 0; j < m; j++) {
      const t = (j + 0.5) / m;                      // 0..1 po luku
      const x = 200 - l.s + 2 * l.s * t;
      const y = l.y + l.p * Math.sin(Math.PI * t);  // luk koji visi
      out.push({ x, y });
    }
  });
  return out;
}

export function borSvg(n: number, o: { zaIspis?: boolean } = {}): string {
  const tocke = mjesta(n);
  const girlande = [130, 200, 272, 348].map((y, i) => {
    const s = [36, 62, 90, 120][i], p = [10, 14, 16, 18][i];
    return `<path d="M${200 - s} ${y} Q200 ${y + 2 * p} ${200 + s} ${y}" class="girlanda"/>`;
  }).join("");
  const lampice = tocke.map((t, i) => {
    const boja = BOJE[i % BOJE.length];
    return o.zaIspis
      ? `<circle cx="${t.x.toFixed(1)}" cy="${(t.y + 9).toFixed(1)}" r="11" fill="#fff" stroke="#000" stroke-width="2"/>`
      : `<g id="lampica-${i}" class="lampica" style="--boja:${boja}">
           <rect x="${(t.x - 3).toFixed(1)}" y="${(t.y - 3).toFixed(1)}" width="6" height="6" rx="1" class="kapica"/>
           <circle cx="${t.x.toFixed(1)}" cy="${(t.y + 9).toFixed(1)}" r="18" class="sjaj"/>
           <circle cx="${t.x.toFixed(1)}" cy="${(t.y + 9).toFixed(1)}" r="10" class="kugla"/>
           <circle cx="${(t.x - 3).toFixed(1)}" cy="${(t.y + 5).toFixed(1)}" r="3" class="odsjaj"/>
         </g>`;
  }).join("");
  const sloj = (y: number, s: number, v: number) =>
    `<path d="M200 ${y} L${200 + s} ${y + v} Q200 ${y + v + 16} ${200 - s} ${y + v} Z" class="krosnja"/>` +
    `<path d="M200 ${y} L${200 + s * 0.55} ${y + v * 0.55} Q${200 + s * 0.2} ${y + v * 0.62} 200 ${y + v * 0.5} Q${200 - s * 0.25} ${y + v * 0.62} ${200 - s * 0.55} ${y + v * 0.55} Z" class="snijeg"/>`;
  return `<svg viewBox="0 0 400 470" xmlns="http://www.w3.org/2000/svg" class="bor" role="img" aria-label="Bor s lampicama">
    <rect x="182" y="404" width="36" height="46" rx="4" class="deblo"/>
    ${sloj(250, 150, 140)}${sloj(170, 118, 120)}${sloj(100, 88, 100)}${sloj(40, 58, 84)}
    ${girlande}${lampice}
    <path d="M200 6 l9 19 21 3 -15 15 4 21 -19 -10 -19 10 4 -21 -15 -15 21 -3 Z" class="zvijezda"/>
  </svg>`;
}
