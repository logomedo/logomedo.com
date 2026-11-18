// Slušne vrste zadataka (docs/zadaci.md, „koje_slovo” i „pozicija_glasa”): dijete čuje glas
// (snimka logopedice, ključ `/s/` u tablici zvukovi, docs/zvukovi.md „Snimke glasova”).
// Čisti TS: editor, igra, HTML ispis, PDF i testovi računaju isti raspored.
import { fonemi } from "../fonemi.ts";

/** Hrvatska abeceda (30 glasova, dvoslovi su jedan glas). Isto kao ABECEDA u vrste.ts. */
export const GLASOVI = ["A", "B", "C", "Č", "Ć", "D", "DŽ", "Đ", "E", "F", "G", "H", "I", "J", "K", "L", "LJ", "M", "N", "NJ", "O", "P", "R", "S", "Š", "T", "U", "V", "Z", "Ž"];

/** Ključ snimke glasa u tablici `zvukovi`: `/s/`, `/dž/`. ElevenLabs ga nikad ne generira. */
export const kljucGlasa = (glas: string) => `/${glas.toLocaleLowerCase("hr")}/`;
export const jeKljucGlasa = (k: string) => /^\/\p{L}{1,2}\/$/u.test(k);
/** Slug za datoteku i adresu (`dz`, `lj`, `s-kvacica` nije potrebno: hash ide u ime). */
export const glasIzKljuca = (k: string) => (jeKljucGlasa(k) ? k.slice(1, -1).toLocaleUpperCase("hr") : null);

export type VelicinaSlova = "velika" | "mala";
/** Slovo kako ga dijete vidi: DŽ → dž za mala slova. */
export const prikazSlova = (glas: string, v: VelicinaSlova | undefined) => (v === "mala" ? glas.toLocaleLowerCase("hr") : glas);

/**
 * Slova koja dijete lako zamijeni sluhom ili okom: ometači idu prvo iz iste skupine
 * (S, Š, Z, Ž, C, Č, Ć su sibilanti; LJ, L, J; NJ, N, M; zvučni i bezvučni parovi).
 */
export const SLICNA: string[][] = [
  ["S", "Š", "Z", "Ž", "C"], ["C", "Č", "Ć", "S"], ["Č", "Ć", "DŽ", "Đ", "Š"], ["Ž", "DŽ", "Đ", "Z"],
  ["L", "LJ", "J", "R"], ["N", "NJ", "M"], ["B", "P", "D", "M"], ["D", "T", "B"], ["G", "K", "H"], ["F", "V", "H"],
  ["A", "E", "O"], ["I", "E", "J"], ["O", "U", "A"],
];
export function slicnaSlova(glas: string): string[] {
  const out: string[] = [];
  for (const s of SLICNA) if (s.includes(glas)) for (const x of s) if (x !== glas && !out.includes(x)) out.push(x);
  return out;
}

export const GRAFEMA_MIN = 4, GRAFEMA_MAX = 16, GRAFEMA_ZADANO = 10;

/** Ponuđena slova za glas: glas jednom, do 3 slična, ostalo nasumično; redoslijed nasumičan. */
export function slozPonudeno(glas: string, n: number, rnd: () => number = Math.random): string[] {
  n = Math.max(GRAFEMA_MIN, Math.min(GRAFEMA_MAX, n));
  const mijesaj = <T>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const slicna = mijesaj(slicnaSlova(glas)).slice(0, Math.min(3, n - 1));
  const ostala = mijesaj(GLASOVI.filter((x) => x !== glas && !slicna.includes(x))).slice(0, n - 1 - slicna.length);
  return mijesaj([glas, ...slicna, ...ostala]);
}

// ---- Razbacana slova: isti raspored na ekranu, u HTML ispisu i u PDF-u ----

/** Mali deterministički PRNG (mulberry32) iz teksta. */
export function sjeme(tekst: string): () => number {
  let h = 1779033703 ^ tekst.length;
  for (let i = 0; i < tekst.length; i++) { h = Math.imul(h ^ tekst.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Razbacano { x: number; y: number; kut: number; boja: number }
/**
 * Položaji n slova u pravokutniku omjera `omjer` (širina / visina): mreža ćelija koje se ne preklapaju,
 * slovo u ćeliji pomaknuto i zakrenuto (±18°). `x`, `y` su središta u 0..1, `celija` je veličina
 * ćelije u udjelu širine (za veličinu slova). Isti `kljuc` = isti raspored.
 */
export function razbaci(n: number, kljuc: string, omjer = 1.6): { mjesta: Razbacano[]; stupaca: number; redova: number } {
  const rnd = sjeme(`${kljuc}|${n}`);
  let stupaca = Math.max(1, Math.round(Math.sqrt(n * omjer)));
  let redova = Math.ceil(n / stupaca);
  // Barem jedna slobodna ćelija za nered, kad stane.
  if (stupaca * redova === n && n > 3) { if (stupaca / redova < omjer) stupaca++; else redova++; }
  const celije = Array.from({ length: stupaca * redova }, (_, i) => i);
  for (let i = celije.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [celije[i], celije[j]] = [celije[j], celije[i]]; }
  const mjesta = celije.slice(0, n).map((c, i) => {
    const sx = c % stupaca, sy = Math.floor(c / stupaca);
    return {
      x: (sx + 0.5 + (rnd() - 0.5) * 0.36) / stupaca,
      y: (sy + 0.5 + (rnd() - 0.5) * 0.36) / redova,
      kut: Math.round((rnd() - 0.5) * 36),
      boja: i % BOJE_SLOVA.length,
    };
  });
  return { mjesta, stupaca, redova };
}
/** Boje slova na ekranu (papir je crno-bijel). */
export const BOJE_SLOVA = ["#d62828", "#1f6fd1", "#2a9d4b", "#8e44ad", "#e07a00", "#0f8b8d", "#c2185b"];

// ---- Pozicija glasa u riječi ----

export type Pozicija = 0 | 1 | 2;
export const POZICIJE: Record<Pozicija, { naziv: string; gdje: string }> = {
  0: { naziv: "početak", gdje: "na početku" },
  1: { naziv: "sredina", gdje: "u sredini" },
  2: { naziv: "kraj", gdje: "na kraju" },
};
export const jePozicija = (x: unknown): x is Pozicija => x === 0 || x === 1 || x === 2;
/**
 * Gdje je glas u riječi: 0 početak, 1 sredina, 2 kraj. Null ako ga riječ nema, ima ga više puta
 * (LOPTICA ima jedan L, ali KOLAČ i LULA: LULA ima dva, nije jednoznačno) ili nije jedna riječ.
 */
export function pozicijaGlasa(glas: string, rijec: string): Pozicija | null {
  if (/[\s-]/.test(rijec.trim())) return null;
  const f = fonemi(rijec);
  const gdje = f.flatMap((x, i) => (x === glas ? [i] : []));
  if (gdje.length !== 1 || f.length < 2) return null;
  return gdje[0] === 0 ? 0 : gdje[0] === f.length - 1 ? 2 : 1;
}
