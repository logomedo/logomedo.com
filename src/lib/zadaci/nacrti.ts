// Nacrti novih zadataka u pregledniku (docs/zadaci.md „Nacrt”): zadatak s predloška nije u bazi dok ga
// logoped ne spremi. Do tada je ovdje, u localStorageu, pod `logomedo-nacrt:<ključ>`; stariji od 14 dana
// se brišu. Sve kroz try/catch: privatni prozor ili puna kvota ne smiju srušiti urednik.
import type { Okvir } from "../okviri";
import type { Sadrzaj, Vrsta } from "./vrste";

export interface NacrtLokalno {
  vrsta: Vrsta; naslov: string; uputa: string | null; podrucje_id: number | null; stil: string;
  sadrzaj: Sadrzaj; okvir: Okvir; po: boolean; vrijeme: number;
}

const PREFIKS = "logomedo-nacrt:";
const TRAJE_MS = 14 * 24 * 3600 * 1000;

export const noviKljuc = () => Math.random().toString(36).slice(2, 10);

export function zapisiNacrt(kljuc: string, n: Omit<NacrtLokalno, "vrijeme">): boolean {
  try { localStorage.setItem(PREFIKS + kljuc, JSON.stringify({ ...n, vrijeme: Date.now() })); return true; } catch { return false; }
}

export function procitajNacrt(kljuc: string): NacrtLokalno | null {
  try { const t = localStorage.getItem(PREFIKS + kljuc); return t ? JSON.parse(t) as NacrtLokalno : null; } catch { return null; }
}

export function obrisiNacrt(kljuc: string) {
  try { localStorage.removeItem(PREFIKS + kljuc); } catch { /* nema pohrane */ }
}

/** Svi nacrti, najnoviji prvi; usput briše istekle i pokvarene. */
export function sviNacrti(): (NacrtLokalno & { kljuc: string })[] {
  const out: (NacrtLokalno & { kljuc: string })[] = [];
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(PREFIKS)) continue;
      let n: NacrtLokalno | null = null;
      try { n = JSON.parse(localStorage.getItem(k) ?? "null"); } catch { /* pokvaren */ }
      if (!n || !n.vrsta || Date.now() - n.vrijeme > TRAJE_MS) { localStorage.removeItem(k); continue; }
      out.push({ ...n, kljuc: k.slice(PREFIKS.length) });
    }
  } catch { /* nema pohrane */ }
  return out.sort((a, b) => b.vrijeme - a.vrijeme);
}

/** Adresa urednika za nacrt (vrsta i „po glasovima” trebaju poslužitelju za podatke vrste). */
export const adresaNacrta = (kljuc: string, vrsta: Vrsta, po: boolean) =>
  `/admin/zadaci/novi?vrsta=${vrsta}${po ? "&po=1" : ""}&nacrt=${kljuc}`;
