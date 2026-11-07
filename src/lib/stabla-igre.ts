// Ukras igre bilježnice u stilu ilustracija: generirana slika stabla (public/igra/, scripts/igra-slike.sh)
// i preko nje N lampica (bor) ili jabuka, složenih po obrisu krošnje iz src/lib/igra-stabla.ts.
// Lampice imaju isti oblik kao u bor.ts/jabuka.ts (`lampica-i`, `.lampica`, `sjaj`, `kugla`, `odsjaj`),
// pa ih igra pali istim kodom. Ispis i dalje koristi crtež iz bor.ts/jabuka.ts (obrisi za bojanje).
import { STABLA } from "./igra-stabla.ts";

type Tocka = { x: number; y: number };
type Stablo = keyof typeof STABLA;

const BOJE_BOR = ["#ffcf4a", "#ff6b6b", "#7fd3ff", "#ffa94d", "#b197fc", "#8ce99a"];
const BOJE_JABUKA = ["#e8443a", "#f4b63a", "#d93a5c", "#f08a2c", "#c92f2f", "#f6d04d"];
/** Krošnja (viewBox y): bor ispod zvijezde do donjih grana, jabuka do mjesta gdje počinju grane. */
const KRUNA: Record<Stablo, [od: number, d: number]> = { bor: [110, 460], jabuka: [40, 330] };

/** Lijevi i desni rub krošnje u redu y (najuži u ±8, jer je rub grana nazubljen). */
export function rub(s: Stablo, y: number): [number, number] {
  const redovi = STABLA[s].obris.filter((r) => Math.abs(r[0] - y) <= 8);
  if (!redovi.length) return [200, 200];
  return [Math.max(...redovi.map((r) => r[1])), Math.min(...redovi.map((r) => r[2]))];
}

/** Bor: girlande (lukovi) od vrha prema dnu, lampice ravnomjerno po duljini lukova. */
export function mjestaBor(n: number): { lukovi: { y: number; l: number; d: number; p: number }[]; tocke: Tocka[] } {
  const [od, d] = KRUNA.bor;
  const broj = n > 30 ? 6 : 5;
  const lukovi = Array.from({ length: broj }, (_, i) => {
    const y = od + ((d - od) * (i + 0.6)) / broj;
    const [l, r] = rub("bor", y);
    const uvuci = (r - l) * 0.12;
    return { y, l: l + uvuci, d: r - uvuci, p: 8 + i * 3 };
  });
  const duljine = lukovi.map((l) => l.d - l.l);
  const ukupno = duljine.reduce((a, b) => a + b, 0);
  const tocke: Tocka[] = [];
  let preostalo = n;
  lukovi.forEach((l, i) => {
    const k = Math.min(preostalo, i === lukovi.length - 1 ? preostalo : Math.round((n * duljine[i]) / ukupno));
    preostalo -= k;
    for (let j = 0; j < k; j++) {
      const t = (j + 0.5) / k;
      tocke.push({ x: l.l + (l.d - l.l) * t, y: l.y + l.p * Math.sin(Math.PI * t) });
    }
  });
  return { lukovi, tocke };
}

/** Jabuka: mreža točaka unutar obrisa krošnje, s razmakom koji primi svih N. */
export function mjestaJabuka(n: number): Tocka[] {
  if (n <= 0) return [];
  const [od, d] = KRUNA.jabuka;
  for (let razmak = 70; razmak >= 16; razmak -= 2) {
    const t: Tocka[] = [];
    for (let red = 0, y = od + razmak * 0.6; y <= d - razmak * 0.3; y += razmak * 0.86, red++) {
      const [l, r] = rub("jabuka", y);
      for (let x = l + (red % 2 ? razmak : razmak / 2); x <= r - razmak * 0.35; x += razmak) t.push({ x, y });
    }
    if (t.length >= n) return Array.from({ length: n }, (_, i) => t[Math.floor(((i + 0.5) * t.length) / n)]);
  }
  return [];
}

const f = (v: number) => v.toFixed(1);
const okvir = (s: Stablo, oznaka: string, sadrzaj: string) =>
  `<svg viewBox="0 0 400 ${STABLA[s].visina}" xmlns="http://www.w3.org/2000/svg" class="bor ilustrirano ${s === "jabuka" ? "jabuka" : ""}" role="img" aria-label="${oznaka}">
    <image href="/igra/${s}.webp" width="400" height="${STABLA[s].visina}"/>${sadrzaj}</svg>`;

export function borIgraSvg(n: number): string {
  const { lukovi, tocke } = mjestaBor(n);
  const girlande = lukovi.map((l) => `<path d="M${f(l.l)} ${f(l.y)} Q200 ${f(l.y + 2 * l.p)} ${f(l.d)} ${f(l.y)}" class="girlanda"/>`).join("");
  const lampice = tocke.map((t, i) => `<g id="lampica-${i}" class="lampica" style="--boja:${BOJE_BOR[i % BOJE_BOR.length]}">
      <circle cx="${f(t.x)}" cy="${f(t.y + 8)}" r="19" class="sjaj"/>
      <circle cx="${f(t.x)}" cy="${f(t.y + 8)}" r="9.5" class="kugla"/>
      <circle cx="${f(t.x - 3)}" cy="${f(t.y + 5)}" r="2.6" class="odsjaj"/></g>`).join("");
  return okvir("bor", "Bor s lampicama", girlande + lampice);
}

export function jabukaIgraSvg(n: number): string {
  const r = n > 24 ? 10 : 13;
  const plodovi = mjestaJabuka(n).map((t, i) => `<g id="lampica-${i}" class="lampica" style="--boja:${BOJE_JABUKA[i % BOJE_JABUKA.length]}">
      <circle cx="${f(t.x)}" cy="${f(t.y)}" r="${r + 9}" class="sjaj"/>
      <path d="M${f(t.x)} ${f(t.y - r)} q2 -7 6 -9" class="peteljka"/>
      <circle cx="${f(t.x)}" cy="${f(t.y)}" r="${r}" class="kugla"/>
      <circle cx="${f(t.x - r / 3)}" cy="${f(t.y - r / 3)}" r="${f(r / 4)}" class="odsjaj"/></g>`).join("");
  return okvir("jabuka", "Jabuka s plodovima", plodovi);
}
