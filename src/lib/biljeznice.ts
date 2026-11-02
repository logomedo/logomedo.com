// Bilježnice: tematski niz zadataka s javnom poveznicom /b/<slug> (docs/biljeznice.md).
// Javni prikaz koristi samo ODOBRENE slike (cdn.logomedo.com): prvo stil bilježnice
// (ilustracija), pa bojanku; riječ bez slike prikazuje se kao riječ.
import { env } from "cloudflare:workers";
import { slug as uSlug } from "./fonemi";
import { dodajURed, javniUrl } from "./generiranje";
import { novaGrupa, sZapisom } from "./aktivnost";
import { stil as nadjiStil } from "./katalog";
import { korisnikId, stvori } from "./zadaci/baza";
import { normaliziraj, rijeciU, type Sadrzaj, type Vrsta } from "./zadaci/vrste";
import { brojSlogova, izvediRimu } from "./zadaci/rima";
import { poIds as pozadinePoId, pozadineU, type Pozadina } from "./pozadine";
import type { Tema } from "./teme";

const DB = () => env.DB;

export interface Biljeznica {
  id: number; slug: string; naslov: string; podnaslov: string | null; tema: Tema; stil: string; javna: number; updated_at: string;
}
export interface ZadatakBiljeznice { id: number; vrsta: Vrsta; naslov: string; uputa: string | null; sadrzaj: Sadrzaj }
export interface RijecBiljeznice { id: number; rijec: string; rima: string | null; slogova: number; slika: string | null }
export interface PodaciBiljeznice { biljeznica: Biljeznica; zadaci: ZadatakBiljeznice[]; rijeci: RijecBiljeznice[]; pozadine: Pozadina[] }

const SQL_B = "SELECT id, slug, naslov, podnaslov, tema, stil, javna, updated_at FROM biljeznice";

export async function popis(): Promise<(Biljeznica & { zadataka: number })[]> {
  return (await DB().prepare(
    `SELECT b.id, b.slug, b.naslov, b.podnaslov, b.tema, b.stil, b.javna, b.updated_at,
       (SELECT COUNT(*) FROM biljeznica_zadaci bz WHERE bz.biljeznica_id = b.id) AS zadataka
     FROM biljeznice b ORDER BY b.updated_at DESC`,
  ).all<Biljeznica & { zadataka: number }>()).results;
}

export const poId = (id: number) => DB().prepare(`${SQL_B} WHERE id = ?`).bind(id).first<Biljeznica>();
export const poSlugu = (s: string) => DB().prepare(`${SQL_B} WHERE slug = ?`).bind(s).first<Biljeznica>();

/** Zadaci bilježnice redom, s aktivnom verzijom sadržaja. */
export async function zadaciBiljeznice(id: number): Promise<ZadatakBiljeznice[]> {
  const { results } = await DB().prepare(
    `SELECT z.id, z.vrsta, z.naslov, z.uputa, v.sadrzaj FROM biljeznica_zadaci bz
     JOIN zadaci z ON z.id = bz.zadatak_id AND z.obrisan_at IS NULL
     JOIN zadatak_verzije v ON v.zadatak_id = z.id AND v.verzija = z.aktivna_verzija
     WHERE bz.biljeznica_id = ? ORDER BY bz.redoslijed`,
  ).bind(id).all<{ id: number; vrsta: Vrsta; naslov: string; uputa: string | null; sadrzaj: string }>();
  return results.map((z) => ({ ...z, sadrzaj: normaliziraj(z.vrsta, JSON.parse(z.sadrzaj)) }));
}

/** Sve što treba javna stranica (igra i ispis). */
export async function podaci(b: Biljeznica): Promise<PodaciBiljeznice> {
  const zadaci = await zadaciBiljeznice(b.id);
  return { biljeznica: b, zadaci, ...(await rijeciIPozadine(zadaci, b.stil)) };
}

/**
 * Riječi (s odobrenom slikom, prvo u stilu `stil`) i pozadine koje zadaci spominju.
 * Dijele ga javna bilježnica i /api/v1 (aplikacija crta isti JSON).
 */
export async function rijeciIPozadine(zadaci: { vrsta: Vrsta; sadrzaj: Sadrzaj }[], stil: string): Promise<{ rijeci: RijecBiljeznice[]; pozadine: Pozadina[] }> {
  const ids = [...new Set(zadaci.flatMap((z) => rijeciU(z.vrsta, z.sadrzaj)))];
  const { results } = await DB().prepare(
    `SELECT r.id, r.rijec, r.rima AS rima_rucno,
       (SELECT s.r2_kljuc FROM slike s JOIN stilovi st ON st.id = s.stil_id
        WHERE s.rijec_id = r.id AND s.status = 'odobrena'
        ORDER BY CASE st.kod WHEN ?2 THEN 0 ELSE 1 END LIMIT 1) AS kljuc
     FROM rijeci r WHERE r.id IN (SELECT value FROM json_each(?1))`,
  ).bind(JSON.stringify(ids), stil).all<{ id: number; rijec: string; rima_rucno: string | null; kljuc: string | null }>();
  return {
    pozadine: await pozadinePoId(pozadineU(zadaci)),
    rijeci: results.map((r) => ({
      id: r.id, rijec: r.rijec, rima: r.rima_rucno ?? izvediRimu(r.rijec), slogova: brojSlogova(r.rijec),
      slika: r.kljuc ? javniUrl(r.kljuc) : null,
    })),
  };
}

/** Stanje slika riječi bilježnice u stilu bilježnice: za admin i gumb „Generiraj ilustracije”. */
export async function stanjeSlika(b: Biljeznica) {
  const zadaci = await zadaciBiljeznice(b.id);
  const ids = [...new Set(zadaci.flatMap((z) => rijeciU(z.vrsta, z.sadrzaj)))];
  return (await DB().prepare(
    `SELECT r.id, r.rijec, r.slug,
       (SELECT s.id FROM slike s JOIN stilovi st ON st.id = s.stil_id WHERE s.rijec_id = r.id AND st.kod = ?2 AND s.status = 'odobrena') AS odobrena,
       (SELECT COUNT(*) FROM slike s JOIN stilovi st ON st.id = s.stil_id WHERE s.rijec_id = r.id AND st.kod = ?2 AND s.status = 'kandidat') AS kandidata,
       (SELECT COUNT(*) FROM generiranja q JOIN stilovi st ON st.id = q.stil_id WHERE q.rijec_id = r.id AND st.kod = ?2 AND q.status IN ('ceka','radi')) AS u_redu
     FROM rijeci r WHERE r.id IN (SELECT value FROM json_each(?1)) ORDER BY r.rijec`,
  ).bind(JSON.stringify(ids), b.stil).all<{ id: number; rijec: string; slug: string; odobrena: number | null; kandidata: number; u_redu: number }>()).results;
}

/** U red za generiranje: riječi bez odobrene slike, kandidata i posla u stilu bilježnice. */
export async function generirajSlike(b: Biljeznica, email: string): Promise<number> {
  const bez = (await stanjeSlika(b)).filter((r) => !r.odobrena && !r.kandidata && !r.u_redu).map((r) => r.id);
  return dodajURed(await nadjiStil(b.stil), bez, email);
}

/** Provjera naslova i poveznice (nova bilježnica i spremanje); vraća poruku ili null. */
export async function provjeriPolja(x: { naslov: string; slug: string }, id: number | null): Promise<string | null> {
  if (x.naslov.trim().length < 3) return "Naslov mora imati barem 3 znaka.";
  const s = uSlug(x.slug);
  if (x.slug.trim() && s.length < 3) return "Poveznica mora imati barem 3 slova ili broja.";
  if (s) {
    const ista = await poSlugu(s);
    if (ista && ista.id !== id) return `Poveznica /b/${s} je već zauzeta („${ista.naslov}”).`;
  }
  return null;
}

/** Prazna bilježnica; poveznica iz naslova ako nije zadana (s brojem ako je zauzeta). */
export async function nova(email: string, x: { naslov: string; podnaslov: string; slug: string; tema: Tema }): Promise<number> {
  const osnova = uSlug(x.slug) || uSlug(x.naslov) || "biljeznica";
  let slug = osnova;
  for (let n = 2; await poSlugu(slug); n++) slug = `${osnova}-${n}`;
  const b = await DB().prepare(
    "INSERT INTO biljeznice (slug, naslov, podnaslov, tema, autor_id) VALUES (?, ?, ?, ?, ?) RETURNING id",
  ).bind(slug, x.naslov.trim().slice(0, 120), x.podnaslov.trim().slice(0, 200) || null, x.tema, await korisnikId(email)).first<{ id: number }>();
  return b!.id;
}

export async function spremi(id: number, email: string, x: { naslov: string; podnaslov: string; slug: string; javna: boolean; tema: Tema; zadaci: number[] }) {
  const s = uSlug(x.slug) || `biljeznica-${id}`;
  await DB().batch(sZapisom({ tko: email, radnja: "biljeznica.spremljena", tablica: "biljeznice", grupa: novaGrupa() }, id, [
    DB().prepare("UPDATE biljeznice SET naslov = ?, podnaslov = ?, slug = ?, javna = ?, tema = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(x.naslov.slice(0, 120), x.podnaslov.slice(0, 200) || null, s, x.javna ? 1 : 0, x.tema, id),
    DB().prepare("DELETE FROM biljeznica_zadaci WHERE biljeznica_id = ?").bind(id),
    ...x.zadaci.slice(0, 40).map((z, i) =>
      DB().prepare("INSERT OR IGNORE INTO biljeznica_zadaci (biljeznica_id, zadatak_id, redoslijed) VALUES (?, ?, ?)").bind(id, z, i)),
  ]));
}

// ---- Primjer: božićna rima ----
// Ciljne riječi su božićne/zimske, a rima je svakodnevna riječ koju dijete zna.
// Engleski opis ide u prompt slike: s hrvatskom riječju model promašuje (docs/katalog.md).
const OPIS: Record<string, string> = {
  bor: "a decorated Christmas fir tree", "šator": "a camping tent", "čaj": "a cup of hot tea", "šal": "a knitted winter scarf",
  poklon: "a wrapped Christmas gift box with a bow", slon: "an elephant", kapa: "a knitted winter hat with a pompom", "šapa": "a dog's paw",
  "svijeća": "a lit candle", "vreća": "Santa's big sack of presents", "kolač": "a slice of cake", "trubač": "a boy playing a trumpet",
  zmaj: "a friendly dragon", val: "a sea wave", snijeg: "falling snowflakes over a snowy ground", brijeg: "a small green hill",
  balon: "a toy balloon", sanjke: "a wooden sled", traktor: "a farm tractor", zvono: "a golden Christmas bell",
  "plivač": "a child swimming", sob: "a reindeer",
};
const ODABIR: [string, string, string, string][] = [   // zadana, točna, distraktor, distraktor
  ["bor", "šator", "čaj", "šal"], ["poklon", "slon", "kapa", "zvono"], ["kapa", "šapa", "sob", "svijeća"],
  ["svijeća", "vreća", "bor", "kolač"], ["kolač", "trubač", "snijeg", "zvono"], ["čaj", "zmaj", "poklon", "kapa"],
  ["šal", "val", "sanjke", "bor"], ["snijeg", "brijeg", "čaj", "sob"],
];
const ULJEZ: [string, string, string, string][] = [     // tri koje se rimuju, uljez
  ["poklon", "slon", "balon", "sanjke"], ["bor", "šator", "traktor", "zvono"], ["kolač", "trubač", "plivač", "snijeg"],
];
const POVEZI: [string, string][] = [["kapa", "šapa"], ["čaj", "zmaj"], ["šal", "val"], ["poklon", "slon"]];

export async function napraviBozicnu(email: string): Promise<number> {
  const autor = await korisnikId(email);
  const sve = Object.keys(OPIS);
  await DB().batch(sve.map((r) => DB().prepare(
    `INSERT INTO rijeci (rijec, slug, opis_za_sliku, izvor) VALUES (?1, ?2, ?3, 'admin')
     ON CONFLICT(rijec) DO UPDATE SET aktivna = 1, opis_za_sliku = COALESCE(rijeci.opis_za_sliku, excluded.opis_za_sliku)`,
  ).bind(r, uSlug(r), OPIS[r])));
  const { results } = await DB().prepare("SELECT id, rijec FROM rijeci WHERE rijec IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(sve)).all<{ id: number; rijec: string }>();
  const id = (r: string) => results.find((x) => x.rijec === r)!.id;
  const promijesaj = <T>(a: T[]) => a.map((x) => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x);

  const odabir = {
    odnos: "rima" as const,
    stavke: ODABIR.map(([z, t, ...d]) => {
      const ponudeno = promijesaj([t, ...d]);
      return { zadana: id(z), ponudeno: ponudeno.map(id), tocno: ponudeno.indexOf(t) };
    }),
  };
  const uljez = {
    odnos: "rima" as const,
    stavke: ULJEZ.map((red) => { const s = promijesaj(red); return { slike: s.map(id), uljez: s.indexOf(red[3]) }; }),
  };
  const povezi = { odnos: "rima" as const, parovi: POVEZI.map(([l, d]) => ({ lijevo: id(l), desno: id(d) })), desno_redoslijed: [2, 0, 3, 1] };
  const z1 = await stvori(autor, "odabir", 3, "Što se rimuje?", "Što se rimuje s riječi {zadana}?", odabir);
  const z2 = await stvori(autor, "uljez", 3, "Izbaci uljeza", "Koja se riječ ne rimuje s ostalima?", uljez);
  const z3 = await stvori(autor, "povezivanje", 3, "Poveži rime", "Poveži riječi koje se rimuju.", povezi);

  let slug = "bozicna-rima";
  for (let n = 2; await poSlugu(slug); n++) slug = `bozicna-rima-${n}`;
  const b = await DB().prepare(
    "INSERT INTO biljeznice (slug, naslov, podnaslov, autor_id) VALUES (?, 'Božićna rima', 'Za svaki točan odgovor pali se jedna lampica na boru.', ?) RETURNING id",
  ).bind(slug, autor).first<{ id: number }>();
  await DB().batch([z1, z2, z3].map((z, i) =>
    DB().prepare("INSERT INTO biljeznica_zadaci (biljeznica_id, zadatak_id, redoslijed) VALUES (?, ?, ?)").bind(b!.id, z, i)));
  return b!.id;
}
