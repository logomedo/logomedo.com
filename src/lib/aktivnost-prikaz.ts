// Prikaz dnevnika aktivnosti: oznake radnji i razlike snimaka. Bez Workers importa, jer ga koristi
// i skripta u pregledniku (osvježavanje uživo) i test.

export interface StavkaPrikaz {
  id: number; at: string; tko: string; radnja: string; tablica: string; redak_id: number; grupa: string;
  prije: string | null; poslije: string | null; vraca_id: number | null; rijec_id: number | null;
  rijec: string | null; slug: string | null; stil: string | null; biljeznica: string | null;
  vraca_radnja: string | null; kasnije: number; u_grupi: number;
}

/** Oznake bez roda glagola: piše se što se dogodilo, a tko je uz to. */
export const RADNJE: Record<string, string> = {
  "slika.odobrena": "Odobrena slika",
  "slika.odbijena": "Odbijena slika",
  "slika.u_kandidate": "Slika vraćena među kandidate",
  "slika.istisnuta": "Dosadašnja odobrena postala kandidat", // samo stari zapisi (do 4. 11. 2026.)
  "slika.nova": "Nova slika iz runnera",
  "slika.ucitana": "Učitana slika",
  "slika.premjestena": "Slika premještena na drugu riječ",
  "generiranje.zatrazeno": "Zatraženo generiranje",
  "generiranje.uklonjeno": "Uklonjeno iz reda",
  "rijec.nova": "Nova riječ",
  "rijec.uredena": "Uređena riječ",
  "rijec.obrisana": "Obrisana riječ",
  "rijec.preimenovana": "Promijenjen naziv riječi",
  "rijec.vracena": "Riječ vraćena u katalog",
  "generiranje.premjesteno": "Posao u redu premješten na drugu riječ",
  "rijec.glas_potvrden": "Potvrđena pozicija glasa",
  "rijec.glas_maknut": "Maknuta pozicija glasa",
  "biljeznica.spremljena": "Spremljena bilježnica",
  ponisteno: "Poništeno",
  vraceno: "Vraćeno na stanje",
};

export const oznakaRadnje = (r: string) => RADNJE[r] ?? r;

const POLJA: Record<string, string> = {
  status: "status", razlog: "razlog", dorada: "kako treba biti", pregledao: "pregledao", opis_za_sliku: "opis za sliku", recenica: "rečenica",
  rima: "rima", aktivna: "aktivna", rijec: "riječ", slug: "adresa", glasovi: "glasovi", prompt: "prompt",
  naslov: "naslov", podnaslov: "podnaslov", javna: "javna", zadaci: "zadaci",
};
/** Polja koja se mijenjaju uz svaku odluku i ne govore ništa sama za sebe. */
const SKRIVENO = new Set(["pregledano_at", "rijec_id", "stil_id"]);

export interface Razlika { polje: string; prije: string; poslije: string }

type Glas = { glas: string; pozicija: string; potvrdeno: number };
const glas = (g: Glas) => `${g.glas} ${g.pozicija}${g.potvrdeno ? "" : " (nepotvrđeno)"}`;

function tekst(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "object" && x && "glas" in x ? glas(x as Glas) : String(x))).join(", ") : "—";
  return String(v);
}

/** Što se promijenilo između dva snimka (JSON tekst ili null). Glasovi kao dodani/maknuti. */
export function razlike(prije: string | null, poslije: string | null): Razlika[] {
  const a = (prije ? JSON.parse(prije) : {}) as Record<string, unknown>;
  const b = (poslije ? JSON.parse(poslije) : {}) as Record<string, unknown>;
  const kljucevi = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !SKRIVENO.has(k));
  const out: Razlika[] = [];
  for (const k of kljucevi) {
    if (JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null)) continue;
    if (k === "glasovi" && prije && poslije) {
      const sa = new Map(((a[k] as Glas[]) ?? []).map((g) => [`${g.glas}|${g.pozicija}`, g]));
      const sb = new Map(((b[k] as Glas[]) ?? []).map((g) => [`${g.glas}|${g.pozicija}`, g]));
      const maknuto = [...sa.keys()].filter((x) => !sb.has(x)).map((x) => glas(sa.get(x)!));
      const dodano = [...sb.keys()].filter((x) => !sa.has(x)).map((x) => glas(sb.get(x)!));
      const potvrdeno = [...sb.keys()].filter((x) => sa.has(x) && sa.get(x)!.potvrdeno !== sb.get(x)!.potvrdeno).map((x) => glas(sb.get(x)!));
      out.push({ polje: POLJA[k], prije: maknuto.join(", ") || "—", poslije: [...dodano, ...potvrdeno].join(", ") || "—" });
      continue;
    }
    out.push({ polje: POLJA[k] ?? k, prije: prije ? tekst(a[k]) : "—", poslije: poslije ? tekst(b[k]) : "—" });
  }
  return out;
}

/** Uzastopne stavke iste grupe (jedna radnja korisnika) u jedan blok. */
export function grupiraj<T extends { grupa: string }>(stavke: T[]): T[][] {
  const out: T[][] = [];
  for (const s of stavke) {
    const zadnji = out.at(-1);
    if (zadnji && zadnji[0].grupa === s.grupa) zadnji.push(s);
    else out.push([s]);
  }
  return out;
}

/** „ana” iz ana@primjer.hr; runner ostaje runner. */
export const tkoKratko = (tko: string) => tko.split("@")[0];

/** Vrijeme iz D1 (`YYYY-MM-DD HH:MM:SS`, UTC) kao Date. */
export const datum = (at: string) => new Date(at.includes("T") ? at : at.replace(" ", "T") + "Z");

/** „upravo”, „prije 5 min”, „prije 3 h”, inače datum i sat (Zagreb). */
export function relativno(at: string, sada = Date.now()): string {
  const s = Math.round((sada - datum(at).getTime()) / 1000);
  if (s < 45) return "upravo";
  if (s < 3600) return `prije ${Math.round(s / 60)} min`;
  if (s < 6 * 3600) return `prije ${Math.round(s / 3600)} h`;
  return datum(at).toLocaleString("hr-HR", { timeZone: "Europe/Zagreb", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}
