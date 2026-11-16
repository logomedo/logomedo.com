// Napisano polje (docs/zadaci.md, „Napisano umjesto slike”): u uparivanju, povezivanju i izbacivanju
// uljeza polje može umjesto slike pokazati napisanu riječ (dijete čita). U sadržaju je to negativan id:
// `-id` je riječ `id` iz kataloga, napisana. Tako ostaju odnosi (rima, prvi glas…) i provjere, a svaki
// prikaz koji riječ traži kroz `mapaRijeci` dobije zapis bez slike pa je crta kao tekst.
// Brojke i slova nisu napisane riječi nego znakovi iz kataloga (src/lib/znakovi.ts).
//
// Čisti TS: koriste ga editor, igra, HTML ispis, PDF i provjere.

import type { Odabir, Povezivanje, Uljez, Vrsta } from "./vrste.ts";

/** Vrste u kojima polje može biti napisano. */
export const VRSTE_NAPISANO = ["odabir", "povezivanje", "uljez"] as const;
export const jeNapisano = (id: number | null | undefined): boolean => typeof id === "number" && id < 0;
/** Id riječi u katalogu (napisano polje → riječ). */
export const izvorni = (id: number) => Math.abs(id);
/** Polje u zadanom obliku: `napisano` true → negativan id, false → id riječi. */
export const uObliku = (id: number, napisano: boolean) => (napisano ? -Math.abs(id) : Math.abs(id));

/**
 * Mapa id → riječ s napisanim inačicama: za svaku riječ (ne znak) i `-id` s `slika: null` i
 * `napisano: true`. Prikazi (igra, ispis, PDF, editor) traže riječ po id-ju polja preko nje.
 */
export function mapaRijeci<T extends { id: number; slika: string | null; znak?: boolean }>(rijeci: Iterable<T>, m = new Map<number, T & { napisano?: boolean }>()) {
  for (const r of rijeci) {
    if (r.id < 0) continue;
    m.set(r.id, r);
    if (!r.znak) m.set(-r.id, { ...r, id: -r.id, slika: null, slike: undefined, napisano: true });
  }
  return m;
}

/** Polje sadržaja kao par čitaj/piši (da uloga može promijeniti sva svoja polja odjednom). */
interface PoljeUloge { daj: () => number | null; postavi: (id: number) => void }
/** Skupina polja koja se u editoru prebacuje odjednom: zadane / ponuđene, lijevi / desni stupac, sve u uljezu. */
export interface UlogaNapisano { kljuc: string; naziv: string; polja: PoljeUloge[] }

export function ulogeNapisano(v: Vrsta, s: unknown): UlogaNapisano[] {
  if (v === "odabir") {
    const st = (s as Odabir).stavke;
    return [
      { kljuc: "zadana", naziv: "Zadane", polja: st.map((x) => ({ daj: () => x.zadana, postavi: (id) => (x.zadana = id) })) },
      { kljuc: "ponudeno", naziv: "Ponuđene", polja: st.flatMap((x) => x.ponudeno.map((_, j) => ({ daj: () => x.ponudeno[j], postavi: (id: number) => (x.ponudeno[j] = id) }))) },
    ];
  }
  if (v === "povezivanje") {
    const p = (s as Povezivanje).parovi;
    return [
      { kljuc: "lijevo", naziv: "Lijevi stupac", polja: p.map((x) => ({ daj: () => x.lijevo, postavi: (id) => (x.lijevo = id) })) },
      { kljuc: "desno", naziv: "Desni stupac", polja: p.map((x) => ({ daj: () => x.desno, postavi: (id) => (x.desno = id) })) },
    ];
  }
  if (v === "uljez") {
    const st = (s as Uljez).stavke;
    return [{ kljuc: "sve", naziv: "Sva polja", polja: st.flatMap((x) => x.slike.map((_, j) => ({ daj: () => x.slike[j], postavi: (id: number) => (x.slike[j] = id) }))) }];
  }
  return [];
}

/** Uloga je napisana kad je napisano svako popunjeno polje (i barem jedno je popunjeno). Znakove `jeZnak` preskače. */
export function ulogaNapisana(u: UlogaNapisano, jeZnak: (id: number) => boolean = () => false): boolean {
  const pune = u.polja.map((p) => p.daj()).filter((id): id is number => id !== null && !jeZnak(id));
  return pune.length > 0 && pune.every(jeNapisano);
}

/** Sva popunjena polja uloge u zadani oblik; znakovi (slova, brojke) ostaju kakvi jesu. */
export function postaviUlogu(u: UlogaNapisano, napisano: boolean, jeZnak: (id: number) => boolean = () => false): void {
  for (const p of u.polja) { const id = p.daj(); if (id !== null && !jeZnak(id)) p.postavi(uObliku(id, napisano)); }
}
