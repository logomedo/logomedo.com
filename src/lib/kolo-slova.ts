// Kolo sa slovima (vrsta `prvi_glas`, docs/zadaci.md): dijete ga dodirne, kolo se zavrti i
// uspori do zadanog slova. Isti DOM i CSS (kolo-slova.css) koriste admin pregled („Dijete
// rješava”) i igra bilježnice. Okretanje je rAF s easingom, ne CSS transition, da se svaki
// prijelaz preko pregrade može čuti (`naTik`).

const SVG = "http://www.w3.org/2000/svg";
// DOM tipovi u ovom projektu sudaraju se s tipovima Workera (append), pa kroz any kao u klijent.ts.
const app = (e: unknown, ...d: unknown[]) => (e as any).append(...d);
import { BOJE_KOLA, type BojeKola } from "./zadaci/vrste.ts";

function s<K extends keyof SVGElementTagNameMap>(tag: K, a: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
  return e;
}

/** Točka na kružnici; kut u stupnjevima od vrha, u smjeru kazaljke. */
const tocka = (r: number, kut: number) => [r * Math.sin((kut * Math.PI) / 180), -r * Math.cos((kut * Math.PI) / 180)];

export interface Kolo { el: HTMLElement; zavrti: () => void }

export const ZLATNO = -1;
/**
 * Polja kola i indeks boje svakog polja (u paleti od `m` boja; ZLATNO = zlatno polje).
 * Susjedna polja nikad nemaju istu boju, ni zadnje i prvo (kolo je zatvoreno). Dvije boje
 * (crveno-bijelo) i neparan broj slova: do 15 slova slova se ponove dvaput (kao na pravom kolu
 * sreće), inače zadnje polje bude zlatno. Više boja: zadnje polje uzme srednju boju.
 */
export function rasporedKola(slova: string[], m: number): { polja: string[]; boje: number[] } {
  const polja = m === 2 && slova.length % 2 === 1 && slova.length <= 15 ? [...slova, ...slova] : slova;
  const n = polja.length;
  const boje = polja.map((_, i) => (i === n - 1 && n > 1 && (n - 1) % m === 0 ? (m > 2 ? 1 : ZLATNO) : i % m));
  return { polja, boje };
}

export function koloSlova(o: { slova: string[]; cilj: string; naPocetak?: () => void; naTik?: () => void; naKraj: (slovo: string) => void; trajanje?: number; boje?: BojeKola }): Kolo {
  const tema = BOJE_KOLA[o.boje ?? "sareno"] ?? BOJE_KOLA.sareno;
  const { polja, boje } = rasporedKola(o.slova, tema.polja.length);
  const n = Math.max(2, polja.length);
  const seg = 360 / n;
  const boja = (i: number) => boje[i];
  const bojaPolja = (i: number) => (boja(i) === ZLATNO ? "#f4c542" : tema.polja[boja(i)]);
  const bojaSlova = (i: number) => (boja(i) === ZLATNO ? "#8a1414" : tema.slova[boja(i) % tema.slova.length]);
  const svg = s("svg", { viewBox: "-104 -104 208 208", class: "kolo-svg", "aria-hidden": "true" });
  const krug = s("g", { class: "kolo-krug" });
  const R = 98;
  // Font prema broju polja: 30 slova stane u ~12°, dvoslovi su uži. S malo slova (logoped je
  // odabrao samo neka) polja su široka, pa je slovo veće i bliže sredini polja.
  const velicina = Math.min(n <= 8 ? 40 : 22, Math.max(9, 330 / n));
  const polumjerSlova = n <= 8 ? R * 0.63 : R - velicina * 0.95;
  polja.forEach((slovo, i) => {
    const a0 = i * seg, a1 = (i + 1) * seg;
    const [x0, y0] = tocka(R, a0), [x1, y1] = tocka(R, a1);
    const g = s("g", { class: "kolo-polje", "data-i": i });
    app(g, s("path", { d: `M0 0 L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${seg > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`, fill: bojaPolja(i) }));
    const t = s("text", { x: 0, y: -polumjerSlova, "text-anchor": "middle", "dominant-baseline": "central", "font-size": slovo.length > 1 ? velicina * 0.78 : velicina, fill: bojaSlova(i),
      transform: `rotate(${a0 + seg / 2})` });
    t.textContent = slovo;
    app(g, t);
    app(krug, g);
  });
  app(krug, s("circle", { r: R, class: "kolo-rub" }));
  // Čavlići na pregradama.
  for (let i = 0; i < n; i++) { const [x, y] = tocka(R - 2, i * seg); app(krug, s("circle", { cx: x.toFixed(2), cy: y.toFixed(2), r: 1.6, class: "kolo-cavlic" })); }
  app(svg, krug, s("circle", { r: 20, class: "kolo-sredina" }));
  const strelica = s("path", { d: "M0 -88 L-9 -106 L9 -106 Z", class: "kolo-strelica" });
  app(svg, strelica);

  const gumb = document.createElement("button");
  gumb.type = "button"; gumb.className = "kolo-gumb"; gumb.textContent = "Zavrti";
  const el = document.createElement("div");
  el.className = `kolo kolo-${o.boje ?? "sareno"}`;
  app(el, svg, gumb);

  let kut = 0, vrti = false, gotovo = false;
  const postavi = (k: number) => krug.setAttribute("transform", `rotate(${k.toFixed(3)})`);

  function zavrti() {
    if (vrti || gotovo) return;
    // Kad se slovo ponavlja, kolo stane na jedno od njegovih polja nasumično.
    const mjesta = polja.flatMap((sl, j) => (sl === o.cilj ? [j] : []));
    const i = mjesta.length ? mjesta[Math.floor(Math.random() * mjesta.length)] : 0;
    vrti = true;
    el.classList.add("vrti");
    o.naPocetak?.();
    // Polje i mora završiti pod strelicom (vrh): kut + središte polja ≡ 0 (mod 360).
    const odmak = (Math.random() - 0.5) * seg * 0.6;
    const cilj = -(i * seg + seg / 2) + odmak;
    const okretaja = 5 + Math.floor(Math.random() * 2);
    const kraj = kut + okretaja * 360 + (((cilj - kut) % 360) + 360) % 360;
    const pocetak = kut, put = kraj - pocetak;
    const manje = matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const T = manje ? 900 : o.trajanje ?? 4600;
    const t0 = performance.now();
    let zadnjiTik = Math.floor((pocetak + seg / 2) / seg);
    const korak = (t: number) => {
      const x = Math.min(1, (t - t0) / T);
      const e = 1 - Math.pow(1 - x, 4);   // easeOutQuart: brzo pa dugo usporava
      kut = pocetak + put * e;
      postavi(kut);
      const tik = Math.floor((kut + seg / 2) / seg);
      if (tik !== zadnjiTik) { zadnjiTik = tik; o.naTik?.(); }
      if (x < 1) { requestAnimationFrame(korak); return; }
      vrti = false; gotovo = true;
      el.classList.remove("vrti"); el.classList.add("stalo");
      krug.querySelector(`.kolo-polje[data-i="${i}"]`)?.classList.add("pobjednik");
      setTimeout(() => o.naKraj(polja[i]), 450);
    };
    requestAnimationFrame(korak);
  }
  el.addEventListener("click", zavrti);
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); zavrti(); } });
  return { el, zavrti };
}

/** Veliko slovo koje „iskoči” iz kola (animacija u CSS-u). */
export function iskocenoSlovo(slovo: string, kl = ""): HTMLElement {
  const d = document.createElement("div");
  d.className = `kolo-iskoci ${kl}`.trim();
  const b = document.createElement("span");
  b.textContent = slovo;
  app(d, b);
  return d;
}

/** Mala oznaka slova uz pitanje dok dijete traži slike. */
export function znackaSlova(slovo: string): HTMLElement {
  const d = document.createElement("span");
  d.className = "kolo-znacka";
  d.textContent = slovo;
  return d;
}
