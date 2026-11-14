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

// Scribe za kratku hrvatsku riječ zna vratiti ćirilicu („дим”, „Бал”, „Конь”) iako je izgovor
// dobar: preslovi je u latinicu prije usporedbe (srpska ćirilica + ruska slova koja se javljaju).
const CIRILICA: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "đ", е: "e", ж: "ž", з: "z", и: "i", ј: "j", к: "k", л: "l", љ: "lj", м: "m",
  н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t", ћ: "ć", у: "u", ф: "f", х: "h", ц: "c", ч: "č", џ: "dž", ш: "š",
  й: "j", ы: "i", э: "e", ю: "ju", я: "ja", ё: "jo", щ: "šč", ъ: "", і: "i", ї: "ji", є: "je", ґ: "g",
};
export const latinica = (t: string) =>
  t.toLocaleLowerCase("hr").replace(/нь/g, "nj").replace(/ль/g, "lj").replace(/ь/g, "").replace(/[\u0400-\u04ff]/g, (c) => CIRILICA[c] ?? c);

/** Za usporedbu s prijepisom: latinica, bez interpunkcije, malim slovima. Dijakritici ostaju (č ≠ c u logopediji). */
export const zaUsporedbu = (t: string) =>
  latinica(kljucZvuka(t)).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

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

// ── Načini izgovora ──────────────────────────────────────────────────────────────────────────
// Način = „model” ili „model+kontekst” ili „model+rez”. Pokus 14. 11. 2026. (docs/zvukovi.md):
// eleven_v4 kratku riječ bez konteksta čita engleski („Led.” → „Lead”, „Šal.” → „Shall”), a
// eleven_multilingual_v2 s hrvatskim kontekstom (previous_text) ili izrezan iz rečenice točno.

export const KONTEKST = "Ovo je hrvatska riječ:";
/** Rečenica-nosač za „rez”: TTS izgovori cijelu, a snimka počinje na riječi (vremenske oznake). */
export const NOSAC = "Reci riječ: ";
export const MODEL_KRATKO = "eleven_multilingual_v2";

export type Dodatak = "" | "kontekst" | "rez";
export function razloziNacin(n: string): { model: string; dodatak: Dodatak } {
  const [model, d = ""] = n.split("+");
  return { model, dodatak: d === "kontekst" || d === "rez" ? d : "" };
}

export const brojRijeci = (t: string) => zaUsporedbu(t).split(" ").filter(Boolean).length;
export const kratak = (t: string) => brojRijeci(t) <= 2;

/**
 * Redoslijed načina za tekst: i-ti pokušaj (STT razlika = sljedeći) uzima i-ti način, a
 * „varijante” (nakon ljudskog odbijanja) snime sve odjednom pa čovjek bira.
 * Riječ: prvo multilingual_v2 s kontekstom, pa izrezana iz rečenice, pa glavni model.
 * Rečenica: glavni model (dobar u rečenici) dvaput, pa multilingual_v2.
 */
export function naciniZa(tekst: string, glavniModel: string): string[] {
  return kratak(tekst)
    ? [`${MODEL_KRATKO}+kontekst`, `${MODEL_KRATKO}+rez`, glavniModel]
    : [glavniModel, glavniModel, MODEL_KRATKO];
}

const IME_MODELA: Record<string, string> = {
  eleven_v4: "v4", eleven_v3: "v3", eleven_multilingual_v2: "multilingual v2", eleven_flash_v2_5: "flash v2.5",
};
/** Za ljude: „multilingual v2, s kontekstom”. */
export function opisNacina(n: string | null | undefined): string {
  if (!n) return "";
  const { model, dodatak } = razloziNacin(n);
  const m = IME_MODELA[model] ?? model.replace(/^eleven_/, "");
  return dodatak === "kontekst" ? `${m}, s kontekstom` : dodatak === "rez" ? `${m}, izrezano iz rečenice` : m;
}

/** Stalni testni skup glasova (regresija, /admin/zvukovi/glasovi): riječi koje su padale na produkciji. */
export const TEST_SKUP = [
  "led", "dim", "dar", "sir", "šal", "bal", "kamin", "kamper", "konj", "crkva", "zdjela", "mašna",
  "lutka", "neboder", "vijenac", "zvončić", "brijeg", "ljuljačka", "njuška", "džep", "ćup", "čaša",
  "Pronađi sve slike koje počinju glasom Č.",
];
