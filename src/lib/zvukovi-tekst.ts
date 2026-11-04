// Tekstovi izgovora (docs/zvukovi.md). Čisti TS: server (red, provjera), preglednik (igra
// traži snimku po ključu) i testovi.

/** Ključ snimke: malim slovima, jedan razmak. Igra isti tekst zna pisati velikim slovima (scena, uputa). */
export const kljucZvuka = (t: string) => t.normalize("NFC").toLocaleLowerCase("hr").replace(/\s+/g, " ").trim();

/**
 * Tekst za TTS: veliko prvo slovo i točka na kraju, inače bi model riječ VELIKIM slovima
 * mogao čitati kao kraticu, a gola riječ zna dobiti upitnu ili nedovršenu intonaciju.
 */
export function izgovorZa(kljuc: string): string {
  const t = kljuc.trim();
  if (!t) return t;
  // Veliko slovo na početku svake rečenice („bravo! sve…” → „Bravo! Sve…”).
  const s = t.replace(/(^|[.!?…]\s+)(\p{Ll})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase("hr"));
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}

/** Za usporedbu s prijepisom: bez interpunkcije, malim slovima. Dijakritici ostaju (č ≠ c u logopediji). */
export const zaUsporedbu = (t: string) =>
  kljucZvuka(t).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

function levenshtein(a: string, b: string): number {
  const x = [...a], y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

/** 0..1: koliko se prijepis poklapa s tekstom (1 = isto nakon `zaUsporedbu`). */
export function slicnost(tekst: string, prijepis: string): number {
  const a = zaUsporedbu(tekst), b = zaUsporedbu(prijepis);
  if (!a && !b) return 1;
  return 1 - levenshtein(a, b) / Math.max([...a].length, [...b].length);
}

/**
 * Prolazi li automatska provjera. Riječ (do dvije) mora biti prepisana točno, jer je
 * pogrešan glas u riječi upravo ono što logoped ne smije čuti; rečenica smije imati sitnu
 * razliku prijepisa (≥ 0,9), jer STT griješi u interpunkciji i kratkim riječima.
 */
export function prolazi(tekst: string, prijepis: string): boolean {
  const rijeci = zaUsporedbu(tekst).split(" ").filter(Boolean).length;
  const s = slicnost(tekst, prijepis);
  return rijeci <= 2 ? s === 1 : s >= 0.9;
}
