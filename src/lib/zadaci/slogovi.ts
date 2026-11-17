// Rastavljanje riječi na slogove (hrvatski, za „Isti prvi slog” i sve što treba granice slogova).
//
// Jezgra sloga je samoglasnik ili slogotvorno R (KR-TI-CA, CR-KVA); IJE je jedna jezgra (RIJE-KA).
// LJ, NJ i DŽ su jedan glas i nikad se ne dijele. Suglasnici između dviju jezgri:
// - nijedan: granica između samoglasnika (A-VI-ON)
// - jedan: ide u sljedeći slog, prethodni ostaje otvoren (MA-MA, RU-KA, LO-PA-TA)
// - šumnik + zvonačnik (GR, SL, SM, KR, TV, BR, PL...): oba u sljedeći (I-GRA, VE-SLO, PI-SMO)
// - ostale skupine: prvi suglasnik zatvara prethodni slog, ostali idu u sljedeći
//   (POŠ-TAR, MAČ-KA, MAJ-MUN, SUN-CE, MOR-SKI, TOR-BA, PRI-JA-TELJ-STVO, NAJ-LJEP-ŠI)
// - iza prefiksa (POD-, NAD-, OD-, IZ-, RAZ-, BEZ-, PRED-) granica je na prefiksu (POD-MOR-NI-CA)
// Pravila: nastava.hr/slogovi i hrvatski pravopis; zatvoreni slog (koji završava suglasnikom)
// je u hrvatskom običan, pa prvi slog nije uvijek otvoren (logopedica, 17. 11. 2026.).
//
// Čisti TS bez ovisnosti: Worker, editor i testovi.

const SAMOGLASNICI = new Set(["A", "E", "I", "O", "U"]);
/** Zvonačnici (sonanti); ostali suglasnici su šumnici. */
const ZVONACNICI = new Set(["J", "L", "LJ", "M", "N", "NJ", "R", "V"]);
const PREFIKSI = ["PRED", "BEZ", "RAZ", "NAD", "POD", "OD", "IZ"];

/** Glasovi riječi: LJ, NJ i DŽ kao jedan. */
const glasovi = (s: string) => s.match(/LJ|NJ|DŽ|./g) ?? [];

/** Indeksi jezgri u nizu glasova (samoglasnik ili slogotvorno R; u IJE jezgra je E). */
function jezgreGlasova(g: string[]): number[] {
  const out: number[] = [];
  const sam = (x: string | undefined) => x !== undefined && SAMOGLASNICI.has(x);
  for (let i = 0; i < g.length; i++) {
    if (sam(g[i])) {
      if (g[i] === "I" && g[i + 1] === "J" && g[i + 2] === "E") continue;
      out.push(i);
    } else if (g[i] === "R" && !sam(g[i - 1]) && g[i + 1] !== undefined && !sam(g[i + 1])) out.push(i);
  }
  return out;
}

/** Koliko suglasnika skupine (između dviju jezgri) ostaje u prethodnom slogu. */
function uPrethodnom(skupina: string[]): number {
  if (skupina.length <= 1) return 0;
  if (skupina.length === 2 && !ZVONACNICI.has(skupina[0]) && ZVONACNICI.has(skupina[1]) && skupina[1] !== "J") return 0;
  return 1;
}

/** Duljina prefiksa u glasovima (POD-, IZ-...) ako riječ s njim počinje i iza njega ima još sloga, inače 0. */
function prefiks(g: string[]): number {
  const s = g.join("");
  const p = PREFIKSI.find((x) => s.startsWith(x) && s.length > x.length + 1);
  return p ? glasovi(p).length : 0;
}

/** Slogovi riječi velikim slovima; izraz (razmak, crtica) se rastavlja po riječima. */
export function slogovi(rijec: string): string[] {
  return rijec.toLocaleUpperCase("hr").split(/[^A-ZČĆĐŠŽ]+/).filter(Boolean).flatMap(slogoviRijeci);
}

function slogoviRijeci(s: string): string[] {
  const g = glasovi(s);
  const j = jezgreGlasova(g);
  if (j.length <= 1) return [s];
  const out: string[] = [];
  const pr = prefiks(g);
  let pocetak = 0;
  for (let k = 0; k < j.length - 1; k++) {
    const od = j[k] + 1, skupina = g.slice(od, j[k + 1]);
    // Kraj prefiksa unutar skupine od barem dva suglasnika: granica na prefiksu (POD-MOR-NI-CA, OD-RAZ).
    const kraj = skupina.length >= 2 && pr > od && pr < j[k + 1] ? pr : od + uPrethodnom(skupina);
    out.push(g.slice(pocetak, kraj).join(""));
    pocetak = kraj;
  }
  out.push(g.slice(pocetak).join(""));
  return out;
}
