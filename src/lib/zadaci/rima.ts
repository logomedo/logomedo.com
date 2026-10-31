// Ključ rime iz pravopisa: dvije riječi se rimuju ako imaju isti ključ.
// Završava li riječ samoglasnikom, ključ ide od predzadnjeg samoglasnika (KRAVA, TRAVA → AVA),
// inače od zadnjeg (DABAR, ORMAR → AR). Slogotvorno R (CRKVA, VRT) broji se kao samoglasnik,
// a IJE je jedan slog (STRIJELA, PČELA → ELA). Naglasak se ne vidi u pisanju, pa je ključ
// prijedlog: admin ga može prepisati (rijeci.rima).
//
// Čisti TS bez ovisnosti: koriste ga Worker, editor u pregledniku i testovi.

const SAMOGLASNICI = new Set(["A", "E", "I", "O", "U"]);

/** Zadnja riječ izraza, velikim slovima, samo slova („luk-strijela” → STRIJELA). */
function zadnja(rijec: string): string {
  const dijelovi = rijec.toLocaleUpperCase("hr").split(/[^A-ZČĆĐŠŽ]+/).filter(Boolean);
  return dijelovi.at(-1) ?? "";
}

/** Indeksi jezgri slogova. */
function jezgre(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (SAMOGLASNICI.has(c)) {
      // IJE: I i E su jedan slog, jezgra je E.
      if (c === "I" && s[i + 1] === "J" && s[i + 2] === "E") continue;
      out.push(i);
    } else if (c === "R") {
      const prije = s[i - 1], poslije = s[i + 1];
      const suglasnikIliRub = (x: string | undefined) => x === undefined || !SAMOGLASNICI.has(x);
      if (suglasnikIliRub(prije) && poslije !== undefined && !SAMOGLASNICI.has(poslije)) out.push(i);
    }
  }
  return out;
}

export function izvediRimu(rijec: string): string | null {
  const s = zadnja(rijec);
  const j = jezgre(s);
  if (!j.length) return null;
  const naSamoglasnik = SAMOGLASNICI.has(s.at(-1)!);
  const od = naSamoglasnik && j.length >= 2 ? j[j.length - 2] : j[j.length - 1];
  return s.slice(od);
}

export function brojSlogova(rijec: string): number {
  return rijec.toLocaleUpperCase("hr").split(/[^A-ZČĆĐŠŽ]+/).filter(Boolean)
    .reduce((n, d) => n + Math.max(jezgre(d).length, 1), 0);
}

/** Rimuju li se dvije riječi po ključevima. Ista riječ se ne rimuje sama sa sobom. */
export const rimujuSe = (a: { id: number; rima: string | null }, b: { id: number; rima: string | null }) =>
  a.id !== b.id && !!a.rima && a.rima === b.rima;
