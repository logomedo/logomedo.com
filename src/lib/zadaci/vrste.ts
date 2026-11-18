// Vrste zadataka (docs/zadaci.md). Vrsta je mehanika (odaberi, poveži, pronađi uljeza,
// listić, vizualna percepcija), a odnos (rima, isti prvi glas/slog, isti zadnji glas: odnosi.ts) je parametar sadržaja. Točan odgovor je spremljen u
// sadržaju; odnos služi generatoru i upozorenjima u editoru, ne ocjenjivanju.
//
// Čisti TS: koriste ga API (provjera ulaza), editor i prikaz u pregledniku te testovi.

import { brojGlasova, brojSlogova } from "./rima.ts";
import { jeOdnos, kljuc, ODNOSI, poCiljevima, uOdnosu, type Odnos } from "./odnosi.ts";
import { fonemi } from "../fonemi.ts";
import { prikazRijeci } from "../znakovi.ts";
import { GRAFEMA_MAX, GRAFEMA_MIN, GRAFEMA_ZADANO, jePozicija, POZICIJE, pozicijaGlasa, slozPonudeno, type Pozicija, type VelicinaSlova } from "./slusanje.ts";

export type Vrsta = "listic" | "odabir" | "povezivanje" | "uljez" | "scena" | "percepcija" | "prvi_glas" | "slogovi" | "razvrstavanje" | "koje_slovo" | "pozicija_glasa";
export type { Odnos };
type Id = number | null;

/**
 * `raspored`: `auto` = veličina slika prema broju slika na stranici (4 slike → 2 × 2 velike),
 * `CxR` = fiksna mreža C stupaca × R redova na svakoj stranici (`3x4` kao stari LogoMedo, zadano
 * za listiće bez polja). Na stranicu stane C × R slika, ostale idu na sljedeću.
 */
export type RasporedListica = "auto" | `${number}x${number}`;
export interface Listic { kartice: { rijec_id: Id; tekst: string }[]; raspored?: RasporedListica }
/** Najviše kartica na jednoj A4 stranici listića s rasporedom `auto`. */
export const LISTIC_PO_STRANICI = 12;
/** Granice vlastite mreže (A4 uspravno: 5 × 6 daje slike od oko 3 cm). */
export const MREZA_MAX = { stupaca: 5, redova: 6 } as const;
/** Ponuđene mreže u editoru (stupaca × redova). */
export const MREZE_LISTICA = ["1x1", "1x2", "2x2", "2x3", "3x3", "3x4"] as const;

/** Fiksna mreža iz rasporeda, ili null za `auto` i neispravno. */
export function mrezaListica(r: string | undefined): { stupaca: number; redova: number } | null {
  const m = /^(\d)x(\d)$/.exec(r ?? "");
  if (!m) return null;
  const stupaca = Number(m[1]), redova = Number(m[2]);
  return stupaca >= 1 && redova >= 1 && stupaca <= MREZA_MAX.stupaca && redova <= MREZA_MAX.redova ? { stupaca, redova } : null;
}
/** Koliko kartica stane na jednu stranicu listića. */
export const poStraniciListica = (r: RasporedListica | undefined) => { const m = mrezaListica(r ?? "3x4"); return r === "auto" || !m ? LISTIC_PO_STRANICI : m.stupaca * m.redova; };

/**
 * Mreža stranice listića s `n` kartica u prostoru `W` × `H` mm (razmak `g`, `tekst` mm ispod slike):
 * fiksna mreža rasporeda, ili za `auto` broj stupaca koji daje najveću sliku (kod jednake, manje
 * praznih mjesta). Isto računaju PDF i HTML ispis.
 */
export function rasporedListica(n: number, raspored: RasporedListica | undefined, W: number, H: number, g = 7, tekst = 9): { stupaca: number; redova: number; s: number } {
  const velicina = (c: number, r: number) => Math.min((W - (c - 1) * g) / c, (H - (r - 1) * g) / r - tekst);
  if (raspored !== "auto") {
    const m = mrezaListica(raspored) ?? { stupaca: 3, redova: 4 };
    return { ...m, s: velicina(m.stupaca, m.redova) };
  }
  n = Math.max(1, Math.min(LISTIC_PO_STRANICI, n));
  let naj = { stupaca: 1, redova: n, s: -Infinity };
  for (let c = 1; c <= 4; c++) {
    const r = Math.ceil(n / c), s = velicina(c, r);
    if (s > naj.s + 0.5 || (Math.abs(s - naj.s) <= 0.5 && c * r < naj.stupaca * naj.redova)) naj = { stupaca: c, redova: r, s };
  }
  return naj;
}
/**
 * Glasovi odabrani pri izradi (predložak „po glasovima”): editor ih nudi prve pri biranju slike i po njima
 * slaže „Složi automatski”. `glasovi` su id-jevi glasova, `oznake` njihova slova (za natpis), `bez` isključeni glasovi.
 */
export interface GlasoviZadatka { glasovi: number[]; oznake: string[]; pozicija: string; bez: string[] }
export interface Odabir { odnos: Odnos; po_glasovima?: GlasoviZadatka; stavke: { zadana: Id; ponudeno: Id[]; tocno: number }[] }
/** `desno_redoslijed[k]` = indeks para čija je desna slika na k-tom mjestu desnog stupca. */
export interface Povezivanje { odnos: Odnos; po_glasovima?: GlasoviZadatka; parovi: { lijevo: Id; desno: Id }[]; desno_redoslijed: number[] }
export interface Uljez { odnos: Odnos; po_glasovima?: GlasoviZadatka; stavke: { slike: Id[]; uljez: number }[] }
/**
 * Scena: pozadina situacije (uspravna i/ili vodoravna slika), pitanje je `uputa` zadatka, a
 * gumbi su slike iz kataloga. Dijete bira sve s `tocno: true`; ostali su ometači.
 * Redoslijed gumba je spremljen i isti na ekranu i papiru.
 */
export interface Scena { pozadina_id: Id; gumbi: { rijec_id: Id; tocno: boolean }[] }
/**
 * Vizualna percepcija: u redu je nekoliko sličnih slika (ista slika, različito okrenuta,
 * obojena ili velika). `razlicitu`: sve su iste osim jedne, dijete bira nju. `par`: sve su
 * različite osim dvije, dijete bira obje. `tocno` su indeksi polja (jedan ili dva).
 */
export type Trazi = "razlicitu" | "par";
export interface Polje { rijec_id: Id; izmjena: Izmjena }
export interface Percepcija { trazi: Trazi; stavke: { polja: Polje[]; tocno: number[] }[] }
/**
 * Prvi glas (izdvajanje prvog glasa): dijete zavrti kolo sa slovima, kolo stane na `slovo`
 * kruga, pa među 12–15 slika pronalazi sve koje počinju tim glasom. Kolo izgleda nasumično,
 * a staje na slovo koje je logoped odabrao, jer slike kruga moraju odgovarati slovu (i na papiru).
 * `tocno` su indeksi slika koje počinju glasom; editor ih računa iz riječi (`prviGlas`).
 */
export interface Krug { slovo: string | null; slike: Id[]; tocno: number[] }
export interface PrviGlas { kolo: string[]; boje?: BojeKola; krugovi: Krug[] }
/**
 * Krug ide u igru (bilježnica i „Dijete rješava”) samo ako ima slovo koje je na kolu, točnu
 * sliku i barem jednu sliku. Slovo maknuto s kola u editoru ostavlja krug, ali ga igra preskače.
 */
export const krugUIgri = (pg: PrviGlas, k: Krug) => !!k.slovo && pg.kolo.includes(k.slovo) && k.tocno.length > 0 && k.slike.some((x) => x !== null);
/** Boje polja kola (ciklički) i boja slova na svakoj. */
export type BojeKola = "sareno" | "crveno-bijelo" | "crveno-bijelo-plavo";
export const BOJE_KOLA: Record<BojeKola, { naziv: string; polja: string[]; slova: string[] }> = {
  sareno: { naziv: "Šareno", polja: ["#ffd166", "#ef8a7a", "#8fd3a8", "#86c5f0", "#c9a7e8", "#f7b267"], slova: ["#2b2118"] },
  "crveno-bijelo": { naziv: "Crveno-bijelo", polja: ["#d62828", "#ffffff"], slova: ["#ffffff", "#c01f1f"] },
  "crveno-bijelo-plavo": { naziv: "Crveno-bijelo-plavo", polja: ["#d62828", "#ffffff", "#1f4e9c"], slova: ["#ffffff", "#c01f1f", "#ffffff"] },
};
export const jeBojeKola = (x: unknown): x is BojeKola => typeof x === "string" && x in BOJE_KOLA;
/**
 * Prebrajanje (u kodu „slogovi”), tri načina iste mehanike „slika + broj”:
 * `duljina`: dijete jednom bojom zaokruži dugačke riječi (od `DUGA_OD` slogova), drugom kratke.
 * `analiza`: ispod slike je `krugova` krugova, dijete oboji onoliko koliko riječ ima slogova.
 * `glasovi`: isto, ali dijete broji glasove u riječi.
 * `slogova` je izbrojeni broj (slogova ili glasova); računa se iz riječi (`brojSlogova`/`brojGlasova`),
 * a logoped ga može ispraviti. `krugova` je isti ispod svake slike, barem koliko najduža riječ treba.
 */
export type NacinSlogova = "duljina" | "analiza" | "glasovi";
export const NACINI_SLOGOVA: NacinSlogova[] = ["duljina", "analiza", "glasovi"];
/** Koliko se broji u riječi za dani način (duljina i analiza: slogovi). */
export const izbroji = (nacin: NacinSlogova, rijec: string) => (nacin === "glasovi" ? brojGlasova(rijec) : brojSlogova(rijec));
/** Riječ za izbrojeno: „3 sloga”, „5 glasova”. */
export function jedinica(nacin: NacinSlogova, n: number): string {
  const [jedan, dva, pet] = nacin === "glasovi" ? ["glas", "glasa", "glasova"] : ["slog", "sloga", "slogova"];
  const z = n % 10, d = n % 100;
  return `${n} ${z === 1 && d !== 11 ? jedan : z >= 2 && z <= 4 && (d < 12 || d > 14) ? dva : pet}`;
}
/** Krugova ispod slike: koliko traži najveći broj među slikama, ali barem `najmanje`. */
export const krugovaZa = (slike: SlikaSlogova[], najmanje = 4) =>
  Math.max(KRUGOVA_MIN, Math.min(KRUGOVA_MAX, Math.max(najmanje, ...slike.filter((x) => x.rijec_id !== null).map((x) => x.slogova))));
export interface SlikaSlogova { rijec_id: Id; slogova: number }
export interface Slogovi { nacin: NacinSlogova; krugova: number; slike: SlikaSlogova[] }
/** Dugačka riječ ima barem 3 sloga (KRAVA je kratka, KORNJAČA dugačka). */
export const DUGA_OD = 3;
export const jeDuga = (slogova: number) => slogova >= DUGA_OD;
export const SLOGOVA_MAX = 12, KRUGOVA_MIN = 3, KRUGOVA_MAX = 12, SLOGOVI_SLIKA_MAX = 24;
/** Boje bojica: iste na ekranu, u legendi ispisa i u PDF-u. */
export const BOJE_DULJINE = {
  duga: { naziv: "dugačka", boja: "#d62828", bojom: "crvenom" },
  kratka: { naziv: "kratka", boja: "#1f6fd1", bojom: "plavom" },
} as const;
export const UPUTE_SLOGOVA: Record<NacinSlogova, { ekran: string; ispis: string }> = {
  duljina: { ekran: "Dugačke riječi oboji crvenom, a kratke plavom bojicom.", ispis: "Dugačke riječi zaokruži crvenom bojom, a kratke plavom." },
  analiza: { ekran: "Lupni po bubnju za svaki slog u riječi.", ispis: "Izgovori riječ i pljesni na svaki slog. Oboji onoliko krugova koliko riječ ima slogova." },
  glasovi: { ekran: "Lupni po bubnju za svaki glas u riječi.", ispis: "Izgovori riječ glas po glas. Oboji onoliko krugova koliko riječ ima glasova." },
};
/**
 * Razvrstavanje: dijete razvrstava slike u 2–4 vreće (košare, kutije) s oznakom po pravilu: prvi ili
 * zadnji glas (oznaka je slovo, LJ je jedan glas), broj slogova ili broj glasova (oznaka je broj).
 * `kategorija` slike je indeks u `kategorije`; računa se iz riječi (`kategorijaRijeci`), logoped je može
 * prepisati. Na papiru dijete povlači crtu od slike do vreće, na ekranu sliku povuče prstom.
 */
export type PraviloRazvrstavanja = "prvi_glas" | "zadnji_glas" | "slogovi" | "glasovi";
export type TemaRazvrstavanja = "vrece" | "kosare" | "kutije";
export interface SlikaRazvrstavanja { rijec_id: Id; kategorija: number }
export interface Razvrstavanje { pravilo: PraviloRazvrstavanja; tema: TemaRazvrstavanja; kategorije: (string | null)[]; slike: SlikaRazvrstavanja[]; po_glasovima?: GlasoviZadatka }
export const PRAVILA_RAZVRSTAVANJA: Record<PraviloRazvrstavanja, { naziv: string; prema: string; broj: boolean }> = {
  prvi_glas: { naziv: "Prvi glas", prema: "prema prvom glasu", broj: false },
  zadnji_glas: { naziv: "Zadnji glas", prema: "prema zadnjem glasu", broj: false },
  slogovi: { naziv: "Broj slogova", prema: "prema broju slogova", broj: true },
  glasovi: { naziv: "Broj glasova", prema: "prema broju glasova", broj: true },
};
export const TEME_RAZVRSTAVANJA: Record<TemaRazvrstavanja, { naziv: string; u: string; s: string }> = {
  vrece: { naziv: "Vreće", u: "u vreće", s: "s vrećom" },
  kosare: { naziv: "Košare", u: "u košare", s: "s košarom" },
  kutije: { naziv: "Kutije", u: "u kutije", s: "s kutijom" },
};
export const jePraviloRazvrstavanja = (x: unknown): x is PraviloRazvrstavanja => typeof x === "string" && x in PRAVILA_RAZVRSTAVANJA;
export const jeTemaRazvrstavanja = (x: unknown): x is TemaRazvrstavanja => typeof x === "string" && x in TEME_RAZVRSTAVANJA;
export const KATEGORIJA_MIN = 2, KATEGORIJA_MAX = 4, RAZVRSTAVANJE_SLIKA_MAX = 12, RAZVRSTAVANJE_BROJ_MAX = 12;
/** Oznaka kategorije kojoj riječ pripada po pravilu („C”, „LJ”, „3”), ili null (izraz, riječ bez slova). */
export function kategorijaRijeci(pravilo: PraviloRazvrstavanja, rijec: string): string | null {
  if (!jednaRijec(rijec)) return null;
  switch (pravilo) {
    case "prvi_glas": return fonemi(rijec)[0] ?? null;
    case "zadnji_glas": return fonemi(rijec).at(-1) ?? null;
    case "slogovi": { const n = brojSlogova(rijec); return n ? String(n) : null; }
    case "glasovi": { const n = brojGlasova(rijec); return n ? String(n) : null; }
  }
}
/** Ispravna oznaka kategorije za pravilo: slovo abecede ili broj 1–12. */
export const jeOznakaKategorije = (pravilo: PraviloRazvrstavanja, x: unknown): x is string =>
  typeof x === "string" && (PRAVILA_RAZVRSTAVANJA[pravilo].broj ? /^([1-9]|1[0-2])$/.test(x) : ABECEDA.includes(x));
/** Uputa razvrstavanja za ekran i papir: „Razvrstaj slike u vreće prema prvom glasu.” */
export function uputeRazvrstavanja(r: Pick<Razvrstavanje, "pravilo" | "tema">): { ekran: string; ispis: string } {
  const t = TEME_RAZVRSTAVANJA[r.tema], p = PRAVILA_RAZVRSTAVANJA[r.pravilo].prema;
  return { ekran: `Razvrstaj slike ${t.u} ${p}.`, ispis: `Razvrstaj slike ${t.u} ${p}. Poveži svaku sliku crtom ${t.s}.` };
}
/**
 * Koje slovo čuješ: igra pusti snimku glasa (logopedica, `/s/`), ispod je 4–16 razbacanih slova
 * (`ponudeno`, glas jednom), dijete dodirne slovo koje je čulo. Na papiru logoped izgovori glas,
 * dijete zaokruži slovo; ključ za logopeda je sitno na dnu stranice. Stavka = ekran = okvir na papiru.
 * `grafema` je koliko slova generator i editor slažu po stavci.
 */
export interface StavkaSlova { glas: string | null; ponudeno: string[] }
/** `po_glasovima`: glasovi iz „Po glasovima…”; svaki je jedna stavka, a ostali su njezini ometači. */
export interface KojeSlovo { slova: VelicinaSlova; grafema: number; stavke: StavkaSlova[]; po_glasovima?: GlasoviZadatka }
export const KOJE_SLOVO_MAX = 12;
export const UPUTE_KOJEG_SLOVA = {
  ekran: "Koje slovo čuješ?",
  ispis: "Poslušaj glas i zaokruži slovo koje čuješ.",
};
/**
 * Pozicija glasa: ispod slike su tri kruga (početak, sredina, kraj riječi), dijete dodirne (oboji)
 * onaj gdje čuje `glas`. `pozicija` slike se računa iz riječi (`pozicijaGlasa`), logoped je može
 * prepisati; riječ s glasom dvaput ili bez njega editor javlja.
 */
export interface SlikaPozicije { rijec_id: Id; pozicija: Pozicija }
export interface PozicijaGlasa { glas: string | null; slike: SlikaPozicije[]; po_glasovima?: GlasoviZadatka }
export const POZICIJA_SLIKA_MAX = 12;
export const UPUTE_POZICIJE = {
  ekran: "Gdje čuješ ovaj glas u riječi?",
  ispis: "Gdje čuješ glas {glas} u riječi? Oboji prvi krug ako je na početku, srednji ako je u sredini, a zadnji ako je na kraju.",
};
export type Sadrzaj = Listic | Odabir | Povezivanje | Uljez | Scena | Percepcija | PrviGlas | Slogovi | Razvrstavanje | KojeSlovo | PozicijaGlasa;

/** Hrvatska abeceda (30 slova, dvoslovi su jedno slovo). Redoslijed kola. */
export const ABECEDA = ["A", "B", "C", "Č", "Ć", "D", "DŽ", "Đ", "E", "F", "G", "H", "I", "J", "K", "L", "LJ", "M", "N", "NJ", "O", "P", "R", "S", "Š", "T", "U", "V", "Z", "Ž"];
export const SLIKA_MIN = 12, SLIKA_MAX = 15;
/** Prvi glas riječi (LJULJAČKA → LJ, LAV → L), ili null ako riječ nema slova. */
export const prviGlas = (rijec: string): string | null => fonemi(rijec)[0] ?? null;
/** Koje slike kruga počinju slovom kruga. */
export function tocneSlike(k: Pick<Krug, "slovo" | "slike">, rijec: (id: number) => string | undefined): number[] {
  return k.slike.flatMap((id, i) => (k.slovo && id !== null && prviGlas(rijec(id) ?? "") === k.slovo ? [i] : []));
}
export const UPUTE_PRVOG_GLASA = {
  kolo: "Zavrti kolo!",
  ekran: "Pronađi sve slike koje počinju glasom {slovo}.",
  ispis: "Zaokruži sve slike koje počinju glasom iz kruga.",
};

/**
 * Kako je slika u polju promijenjena. Crta se istim pravilima na ekranu (CSS), u HTML ispisu
 * i u PDF-u (matrica slike, siva iz canvasa), vidi `izmjenaCss` i pdf/ispis-pdf.ts.
 */
export type Izmjena = "" | "zrcalo" | "naopako" | "lijevo" | "desno" | "siva" | "mala";
export const IZMJENE: Record<Izmjena, string> = {
  "": "izvorna", zrcalo: "zrcaljena", naopako: "naopako", lijevo: "okrenuta ulijevo",
  desno: "okrenuta udesno", siva: "bez boje", mala: "manja",
};
export const jeIzmjena = (x: unknown): x is Izmjena => typeof x === "string" && x in IZMJENE;
/** Stil za `<img>` (i riječ umjesto slike): transform i filter. */
export function izmjenaCss(i: Izmjena): string {
  switch (i) {
    case "zrcalo": return "transform:scaleX(-1)";
    case "naopako": return "transform:rotate(180deg)";
    case "lijevo": return "transform:rotate(-90deg)";
    case "desno": return "transform:rotate(90deg)";
    case "siva": return "filter:grayscale(1)";
    case "mala": return "transform:scale(.68)";
    default: return "";
  }
}
export const POLJA_MIN = 3, POLJA_MAX = 6;
export const TOCNIH: Record<Trazi, number> = { razlicitu: 1, par: 2 };
export const UPUTE_PERCEPCIJE: Record<Trazi, { ekran: string; ispis: string }> = {
  razlicitu: { ekran: "Koja je slika drukčija od ostalih?", ispis: "Koja je slika drukčija od ostalih? Prekriži je." },
  par: { ekran: "Pronađi dvije iste slike.", ispis: "Pronađi dvije iste slike i zaokruži ih." },
};
const istoPolje = (a: Polje, b: Polje) => a.rijec_id === b.rijec_id && a.izmjena === b.izmjena;

/** Riječ kakvu editor i prikaz trebaju. `slika` je URL ili null (prikazuje se riječ). */
/** Najbolja slika riječi po kodu stila; `ok` = odobrena (inače kandidat). */
export type SlikeRijeci = Record<string, { src: string; ok: boolean }>;
/** `znak`: slovo, brojka ili simbol iz kataloga znakova (src/lib/znakovi.ts); prikazuje se kao upisani znak, bez slike. */
export interface RijecZadatka { id: number; rijec: string; rima: string | null; slogova: number; slika: string | null; slike?: SlikeRijeci; znak?: boolean }
/** Riječi za generatore zadataka: znakovi se biraju samo ručno. */
export const zaGenerator = <T extends { znak?: boolean }>(r: T[]) => r.filter((x) => !x.znak);
/**
 * Jedna riječ, ne izraz („ČAROBNI ŠTAPIĆ”, „LUK-STRIJELA”). Izraz je dobar za listić (artikulacija),
 * ali ne za slogove ni glasove: dijete broji slogove i traži prvi glas jedne riječi.
 */
export const jednaRijec = (rijec: string) => !/[\s-]/.test(rijec.trim());

/** Slika za stil zadatka: odobrena u stilu, odobrena u drugom, kandidat u stilu, bilo koja. */
export function slikaUStilu(m: SlikeRijeci, stil: string): string | null {
  const sve = Object.values(m);
  return (m[stil]?.ok ? m[stil] : sve.find((x) => x.ok) ?? m[stil] ?? sve[0])?.src ?? null;
}

export const VRSTE: Record<Vrsta, { naziv: string; opis: string; uputa: string; ispis: string; odnos: boolean }> = {
  listic: {
    naziv: "Radni listić", opis: "Naslov i niz slika s tekstom ispod (riječ ili rečenica).",
    uputa: "", ispis: "Imenuj, oboji, zaokruži", odnos: false,
  },
  slogovi: {
    naziv: "Prebrajanje", opis: "Ispod svake slike su kružići: dijete oboji onoliko koliko prebroji (slogova ili glasova u riječi). Ili dugačke i kratke riječi zaokruži dvjema bojama.",
    uputa: UPUTE_SLOGOVA.duljina.ispis, ispis: "Zaokruži bojama / oboji krugove", odnos: false,
  },
  odabir: {
    naziv: "Uparivanje", opis: "Zadana je jedna slika, ispod su tri. Jedna ide uz zadanu (rimuje se, počinje ili završava istim glasom, počinje istim slogom): dijete je odabire.",
    uputa: "Koja se slika rimuje s prvom? Zaokruži je.", ispis: "Zaokruži", odnos: true,
  },
  povezivanje: {
    naziv: "Povezivanje", opis: "Dva stupca slika. Svaka slika lijevo ima par desno (rima, isti prvi glas ili slog, isti zadnji glas): dijete ih povezuje.",
    uputa: "Poveži slike koje se rimuju.", ispis: "Poveži crtom", odnos: true,
  },
  uljez: {
    naziv: "Izbaci uljeza", opis: "Četiri slike u redu: tri idu zajedno (rima, isti prvi glas ili slog, isti zadnji glas), jedna ne. Dijete pronalazi uljeza.",
    uputa: "Koja se slika ne rimuje s ostalima? Prekriži je.", ispis: "Prekriži", odnos: true,
  },
  scena: {
    naziv: "Scena", opis: "Ilustracija situacije, pitanje na vrhu i traka slika. Dijete bira sve slike koje pripadaju situaciji.",
    uputa: "Što sve pripada ovoj slici?", ispis: "Zaokruži sve što pripada", odnos: false,
  },
  percepcija: {
    naziv: "Vizualna percepcija", opis: "U redu je nekoliko sličnih slika. Dijete pronalazi onu koja se razlikuje ili dvije iste.",
    uputa: UPUTE_PERCEPCIJE.razlicitu.ispis, ispis: "Prekriži / zaokruži", odnos: false,
  },
  prvi_glas: {
    naziv: "Prvi glas (kolo slova)", opis: "Dijete zavrti kolo sa slovima abecede. Kolo stane na slovo, a dijete među 12–15 slika pronalazi sve koje počinju tim glasom.",
    uputa: UPUTE_PRVOG_GLASA.ispis, ispis: "Zaokruži", odnos: false,
  },
  razvrstavanje: {
    naziv: "Razvrstavanje", opis: "Dijete razvrstava slike u dvije do četiri vreće (košare, kutije) s oznakom: po prvom ili zadnjem glasu, broju slogova ili broju glasova.",
    uputa: "Razvrstaj slike u vreće prema prvom glasu. Poveži svaku sliku crtom s vrećom.", ispis: "Poveži crtom s vrećom", odnos: false,
  },
  koje_slovo: {
    naziv: "Koje slovo čuješ?", opis: "Dijete čuje glas, a među razbacanim slovima dodirne ono koje je čulo. Na papiru glas izgovori logoped.",
    uputa: UPUTE_KOJEG_SLOVA.ispis, ispis: "Zaokruži slovo", odnos: false,
  },
  pozicija_glasa: {
    naziv: "Gdje je glas?", opis: "Ispod slike su tri kruga: dijete odabere prvi, srednji ili zadnji, ovisno o tome je li glas na početku, u sredini ili na kraju riječi.",
    uputa: UPUTE_POZICIJE.ispis.replace("glas {glas}", "glas"), ispis: "Oboji krug", odnos: false,
  },
};

/** Zadana uputa za papir; percepcija ovisi o tome traži li se različita ili par. */
export function zadanaUputa(v: Vrsta, s?: Sadrzaj): string {
  if (v === "percepcija" && s) return UPUTE_PERCEPCIJE[(s as Percepcija).trazi].ispis;
  if (v === "slogovi" && s) return UPUTE_SLOGOVA[(s as Slogovi).nacin].ispis;
  if (v === "razvrstavanje" && s) return uputeRazvrstavanja(s as Razvrstavanje).ispis;
  if (v === "pozicija_glasa" && s) return uputaPozicije((s as PozicijaGlasa).glas);
  if ((v === "odabir" || v === "povezivanje" || v === "uljez") && s) return ODNOSI[odnosOd(s)].uputa[v];
  return VRSTE[v].uputa;
}
/** Odnos sadržaja uparivanja, povezivanja ili uljeza (stari zadaci i ostalo: rima). */
export const odnosOd = (s: unknown): Odnos => { const o = (s as { odnos?: unknown } | null)?.odnos; return jeOdnos(o) ? o : "rima"; };
export const jeVrsta = (v: unknown): v is Vrsta => typeof v === "string" && v in VRSTE;

export const PONUDENIH = 3;
export const U_REDU = 4;
/** Gumba na sceni: vodoravno stanu u jedan red, uspravno u dva. */
export const MAX_GUMBA = 10;
/** Najviše redova u odabiru, uljezu i percepciji (PDF ih lomi po 3 na A4). Server reže višak, pa ga ni editor ne nudi. */
export const MAX_REDOVA = 30;
/** Listić po glasu može imati sve riječi glasa na jednoj poziciji (L u sredini: 128 u studenom 2026.). */
export const MAX_KARTICA_LISTICA = 150;

export function prazno(v: Vrsta, stavki = 4): Sadrzaj {
  const n = Array.from({ length: stavki });
  switch (v) {
    case "listic": return { kartice: Array.from({ length: 12 }, () => ({ rijec_id: null, tekst: "" })), raspored: "auto" };
    case "odabir": return { odnos: "rima", stavke: n.map(() => ({ zadana: null, ponudeno: [null, null, null], tocno: 0 })) };
    case "povezivanje": return { odnos: "rima", parovi: n.map(() => ({ lijevo: null, desno: null })), desno_redoslijed: n.map((_, i) => i) };
    case "uljez": return { odnos: "rima", stavke: n.map(() => ({ slike: [null, null, null, null], uljez: 0 })) };
    case "scena": return { pozadina_id: null, gumbi: Array.from({ length: 7 }, (_, i) => ({ rijec_id: null, tocno: i < 5 })) };
    case "percepcija": return { trazi: "razlicitu", stavke: n.map(() => slozRed(null, 4, "razlicitu")) };
    case "prvi_glas": return { kolo: [...ABECEDA], boje: "sareno", krugovi: [{ slovo: null, slike: Array(SLIKA_MIN).fill(null), tocno: [] }] };
    case "slogovi": return { nacin: "duljina", krugova: 4, slike: Array.from({ length: 8 }, () => ({ rijec_id: null, slogova: 1 })) };
    case "razvrstavanje": return { pravilo: "prvi_glas", tema: "vrece", kategorije: [null, null], slike: Array.from({ length: 8 }, (_, i) => ({ rijec_id: null, kategorija: i % 2 })) };
    case "koje_slovo": return { slova: "velika", grafema: GRAFEMA_ZADANO, stavke: n.map(() => ({ glas: null, ponudeno: [] })) };
    case "pozicija_glasa": return { glas: null, slike: Array.from({ length: 6 }, (_, i) => ({ rijec_id: null, pozicija: (i % 3) as Pozicija })) };
  }
}

/**
 * Jedan red percepcije za zadanu sliku: `razlicitu` = n jednakih i jedna izmijenjena,
 * `par` = n različitih izmjena od kojih se jedna ponavlja. Redoslijed nasumičan.
 */
export function slozRed(rijec_id: Id, n: number, trazi: Trazi, rnd: () => number = Math.random): Percepcija["stavke"][0] {
  n = Math.max(POLJA_MIN, Math.min(POLJA_MAX, n));
  const izmjene = promijesaj(Object.keys(IZMJENE).filter((x) => x) as Izmjena[], rnd);
  let polja: Polje[];
  if (trazi === "razlicitu") {
    // Osnova je izvorna slika; različita je jedna od izmjena.
    polja = [...Array.from({ length: n - 1 }, () => ({ rijec_id, izmjena: "" as Izmjena })), { rijec_id, izmjena: izmjene[0] }];
  } else {
    const razne = (["", ...izmjene] as Izmjena[]).slice(0, n - 1);
    polja = [...razne, razne[Math.floor(rnd() * razne.length)]].map((izmjena) => ({ rijec_id, izmjena }));
  }
  polja = promijesaj(polja, rnd);
  return { polja, tocno: tocnaPolja(polja, trazi) };
}

/** Koja polja su točna po samom sadržaju (za generator i editor kad se izmjena promijeni). */
export function tocnaPolja(polja: Polje[], trazi: Trazi): number[] {
  const koliko = (p: Polje) => polja.filter((q) => istoPolje(p, q)).length;
  if (trazi === "razlicitu") { const i = polja.findIndex((p) => koliko(p) === 1); return [i < 0 ? 0 : i]; }
  const par = polja.map((_, i) => i).filter((i) => koliko(polja[i]) === 2);
  return par.length === 2 ? par : [0, 1];
}

// ---- Normalizacija ulaza (API prima JSON iz preglednika) ----

const id = (x: unknown): Id => (Number.isInteger(x) && (x as number) > 0 ? (x as number) : null);
/** Polje uparivanja, povezivanja i uljeza: i negativan id (napisana riječ, napisano.ts). */
const idPolja = (x: unknown): Id => (Number.isInteger(x) && x !== 0 ? (x as number) : null);
const niz = <T>(x: unknown, max: number, f: (e: unknown) => T): T[] => (Array.isArray(x) ? x.slice(0, max).map(f) : []);
const obj = (x: unknown) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
const ind = (x: unknown, n: number) => (Number.isInteger(x) && (x as number) >= 0 && (x as number) < n ? (x as number) : 0);
const tocnoN = <T>(a: T[], n: number, f: () => T) => [...a.slice(0, n), ...Array.from({ length: Math.max(0, n - a.length) }, f)];

const POZICIJE_GLASA = ["", "inicijalna", "medijalna", "finalna", "skupina"];
/** Odabrani glasovi zadatka, ili ništa (nema ih ili su neispravni). */
function glasoviZadatka(x: unknown): { po_glasovima?: GlasoviZadatka } {
  const o = obj(x);
  const glasovi = niz(o.glasovi, 40, (g) => Number(g)).filter((g) => Number.isInteger(g) && g > 0);
  const oznake = niz(o.oznake, 40, (g) => String(g).slice(0, 4));
  const bez = niz(o.bez, 40, (g) => String(g)).filter((g) => ABECEDA.includes(g));
  if (!glasovi.length && !bez.length) return {};
  const pozicija = POZICIJE_GLASA.includes(String(o.pozicija)) && glasovi.length ? String(o.pozicija) : "";
  return { po_glasovima: { glasovi, oznake: oznake.length === glasovi.length ? oznake : glasovi.map(String), pozicija, bez } };
}

/** Iz bilo čega napravi ispravan sadržaj vrste; nepoznato odbacuje. */
export function normaliziraj(v: Vrsta, ulaz: unknown): Sadrzaj {
  const o = obj(ulaz);
  switch (v) {
    case "listic":
      return { kartice: niz(o.kartice, MAX_KARTICA_LISTICA, (k) => ({ rijec_id: id(obj(k).rijec_id), tekst: String(obj(k).tekst ?? "").slice(0, 200) })), raspored: o.raspored === "auto" ? "auto" : mrezaListica(String(o.raspored)) ? (String(o.raspored) as RasporedListica) : "3x4" };
    case "odabir":
      return {
        odnos: odnosOd(o), ...glasoviZadatka(o.po_glasovima),
        stavke: niz(o.stavke, MAX_REDOVA, (s) => {
          const x = obj(s);
          return { zadana: idPolja(x.zadana), ponudeno: tocnoN(niz(x.ponudeno, PONUDENIH, idPolja), PONUDENIH, () => null), tocno: ind(x.tocno, PONUDENIH) };
        }),
      };
    case "povezivanje": {
      const parovi = niz(o.parovi, 8, (p) => ({ lijevo: idPolja(obj(p).lijevo), desno: idPolja(obj(p).desno) }));
      const r = niz(o.desno_redoslijed, 8, (x) => Number(x));
      const ok = r.length === parovi.length && [...r].sort((a, b) => a - b).every((x, i) => x === i);
      return { odnos: odnosOd(o), ...glasoviZadatka(o.po_glasovima), parovi, desno_redoslijed: ok ? r : parovi.map((_, i) => i) };
    }
    case "uljez":
      return {
        odnos: odnosOd(o), ...glasoviZadatka(o.po_glasovima),
        stavke: niz(o.stavke, MAX_REDOVA, (s) => {
          const x = obj(s);
          return { slike: tocnoN(niz(x.slike, U_REDU, idPolja), U_REDU, () => null), uljez: ind(x.uljez, U_REDU) };
        }),
      };
    case "scena":
      return { pozadina_id: id(o.pozadina_id), gumbi: niz(o.gumbi, MAX_GUMBA, (g) => ({ rijec_id: id(obj(g).rijec_id), tocno: obj(g).tocno === true })) };
    case "percepcija": {
      const trazi: Trazi = o.trazi === "par" ? "par" : "razlicitu";
      return {
        trazi,
        stavke: niz(o.stavke, MAX_REDOVA, (s) => {
          const x = obj(s);
          const procitana = niz(x.polja, POLJA_MAX, (p) => ({ rijec_id: id(obj(p).rijec_id), izmjena: jeIzmjena(obj(p).izmjena) ? obj(p).izmjena as Izmjena : "" as Izmjena }));
          const polja = tocnoN(procitana, Math.max(POLJA_MIN, procitana.length), () => ({ rijec_id: null, izmjena: "" as Izmjena }));
          let tocno = [...new Set(niz(x.tocno, POLJA_MAX, (t) => ind(t, polja.length)))].slice(0, TOCNIH[trazi]);
          if (tocno.length < TOCNIH[trazi]) tocno = tocnaPolja(polja, trazi);
          return { polja, tocno: tocno.sort((a, b) => a - b) };
        }),
      };
    }
    case "prvi_glas": {
      const kolo = ABECEDA.filter((x) => Array.isArray(o.kolo) && (o.kolo as unknown[]).includes(x));
      return {
        kolo: kolo.length >= 2 ? kolo : [...ABECEDA],
        boje: jeBojeKola(o.boje) ? o.boje : "sareno",
        krugovi: niz(o.krugovi, MAX_REDOVA, (k) => {
          const x = obj(k);
          const slike = tocnoN(niz(x.slike, SLIKA_MAX, id), Math.max(SLIKA_MIN, Array.isArray(x.slike) ? Math.min(x.slike.length, SLIKA_MAX) : 0), () => null);
          const slovo = typeof x.slovo === "string" && ABECEDA.includes(x.slovo) ? x.slovo : null;
          return { slovo, slike, tocno: [...new Set(niz(x.tocno, SLIKA_MAX, (t) => t))].filter((t): t is number => Number.isInteger(t) && (t as number) >= 0 && (t as number) < slike.length && slike[t as number] !== null).sort((a, b) => a - b) };
        }),
      };
    }
    case "slogovi": {
      const k = Number(o.krugova);
      return {
        nacin: NACINI_SLOGOVA.includes(o.nacin as NacinSlogova) ? (o.nacin as NacinSlogova) : "duljina",
        krugova: Number.isInteger(k) ? Math.max(KRUGOVA_MIN, Math.min(KRUGOVA_MAX, k)) : 4,
        slike: niz(o.slike, SLOGOVI_SLIKA_MAX, (x) => {
          const n = Number(obj(x).slogova);
          return { rijec_id: id(obj(x).rijec_id), slogova: Number.isInteger(n) ? Math.max(1, Math.min(SLOGOVA_MAX, n)) : 1 };
        }),
      };
    }
    case "razvrstavanje": {
      const pravilo = jePraviloRazvrstavanja(o.pravilo) ? o.pravilo : "prvi_glas";
      // Oznake: ispravne za pravilo, bez ponavljanja (ponovljena ostaje prazna), 2–4.
      const procitane = niz(o.kategorije, KATEGORIJA_MAX, (k) => (jeOznakaKategorije(pravilo, k) ? k : null));
      const kategorije = tocnoN(procitane.map((k, i) => (k !== null && procitane.indexOf(k) < i ? null : k)), Math.max(KATEGORIJA_MIN, procitane.length), () => null);
      return {
        pravilo, tema: jeTemaRazvrstavanja(o.tema) ? o.tema : "vrece", ...glasoviZadatka(o.po_glasovima), kategorije,
        slike: niz(o.slike, RAZVRSTAVANJE_SLIKA_MAX, (x) => ({ rijec_id: id(obj(x).rijec_id), kategorija: ind(obj(x).kategorija, kategorije.length) })),
      };
    }
    case "koje_slovo": {
      const g = Number(o.grafema);
      return {
        slova: o.slova === "mala" ? "mala" : "velika",
        grafema: Number.isInteger(g) ? Math.max(GRAFEMA_MIN, Math.min(GRAFEMA_MAX, g)) : GRAFEMA_ZADANO,
        stavke: niz(o.stavke, KOJE_SLOVO_MAX, (x) => {
          const st = obj(x);
          // Ponuđena slova: samo iz abecede, svako jednom.
          const ponudeno = [...new Set(niz(st.ponudeno, GRAFEMA_MAX, (y) => (typeof y === "string" && ABECEDA.includes(y) ? y : null)).filter((y): y is string => y !== null))];
          return { glas: typeof st.glas === "string" && ABECEDA.includes(st.glas) ? st.glas : null, ponudeno };
        }),
        ...glasoviZadatka(o.po_glasovima),
      };
    }
    case "pozicija_glasa": return {
      glas: typeof o.glas === "string" && ABECEDA.includes(o.glas) ? o.glas : null, ...glasoviZadatka(o.po_glasovima),
      slike: niz(o.slike, POZICIJA_SLIKA_MAX, (x) => ({ rijec_id: id(obj(x).rijec_id), pozicija: jePozicija(obj(x).pozicija) ? obj(x).pozicija as Pozicija : 0 })),
    };
  }
}

/** Svi id-jevi riječi u sadržaju (za dohvat slika); napisano polje daje id riječi. */
export function rijeciU(v: Vrsta, s: Sadrzaj): number[] {
  const out: Id[] = [];
  if (v === "listic") out.push(...(s as Listic).kartice.map((k) => k.rijec_id));
  if (v === "odabir") for (const x of (s as Odabir).stavke) out.push(x.zadana, ...x.ponudeno);
  if (v === "povezivanje") for (const p of (s as Povezivanje).parovi) out.push(p.lijevo, p.desno);
  if (v === "uljez") for (const x of (s as Uljez).stavke) out.push(...x.slike);
  if (v === "scena") out.push(...(s as Scena).gumbi.map((g) => g.rijec_id));
  if (v === "percepcija") for (const x of (s as Percepcija).stavke) out.push(...x.polja.map((p) => p.rijec_id));
  if (v === "prvi_glas") for (const k of (s as PrviGlas).krugovi) out.push(...k.slike);
  if (v === "slogovi") out.push(...(s as Slogovi).slike.map((x) => x.rijec_id));
  if (v === "razvrstavanje") out.push(...(s as Razvrstavanje).slike.map((x) => x.rijec_id));
  if (v === "pozicija_glasa") out.push(...(s as PozicijaGlasa).slike.map((x) => x.rijec_id));
  return [...new Set(out.filter((x): x is number => x !== null).map(Math.abs))];
}

// ---- Provjere za editor: zadatak se smije spremiti i s upozorenjima ----

export interface Upozorenje { gdje: string; poruka: string }

export function provjeri(v: Vrsta, s: Sadrzaj, rijeci: Map<number, RijecZadatka>): Upozorenje[] {
  const u: Upozorenje[] = [];
  const R = (x: Id) => (x === null ? null : rijeci.get(x) ?? null);
  const ime = (x: Id) => { const r = R(x); return r ? prikazRijeci(r) : "?"; };
  // Red sa znakom (slovo, brojka) nije zadatak odnosa: provjere odnosa ga preskaču.
  const imaZnak = (ids: Id[]) => ids.some((x) => R(x)?.znak);
  const odnos = odnosOd(s), O = ODNOSI[odnos];
  const rim = (a: Id, b: Id) => { const x = R(a), y = R(b); return !!x && !!y && uOdnosu(odnos, x, y); };
  if (v === "listic") {
    const l = s as Listic;
    if (!l.kartice.some((k) => k.rijec_id)) u.push({ gdje: "listić", poruka: "Listić nema nijednu sliku." });
    return u;
  }
  if (v === "scena") {
    const sc = s as Scena;
    if (sc.pozadina_id === null) u.push({ gdje: "scena", poruka: "Nije odabrana situacija." });
    const pune = sc.gumbi.filter((g) => g.rijec_id !== null);
    if (pune.length < sc.gumbi.length) u.push({ gdje: "scena", poruka: `${sc.gumbi.length - pune.length} gumb(a) bez slike: u igri se ne prikazuju.` });
    if (!pune.some((g) => g.tocno)) u.push({ gdje: "scena", poruka: "Nijedna slika nije označena kao točna." });
    if (pune.length && pune.every((g) => g.tocno)) u.push({ gdje: "scena", poruka: "Nema ometača: sve slike su točne." });
    const vidjeno = new Set<number>();
    for (const g of pune) { if (vidjeno.has(g.rijec_id!)) u.push({ gdje: "scena", poruka: `${ime(g.rijec_id)} je dvaput.` }); vidjeno.add(g.rijec_id!); }
    return u;
  }
  if (v === "prvi_glas") {
    const pg = s as PrviGlas;
    pg.krugovi.forEach((k, i) => {
      const g = `Krug ${i + 1}`;
      if (!k.slovo) { u.push({ gdje: g, poruka: "Nije odabrano slovo na kojem kolo stane." }); return; }
      if (!pg.kolo.includes(k.slovo)) u.push({ gdje: g, poruka: `Slova ${k.slovo} nema na kolu: u igri se krug preskače.` });
      const prazne = k.slike.filter((x) => x === null).length;
      if (prazne) u.push({ gdje: g, poruka: `${prazne} prazn${prazne === 1 ? "a slika" : "ih slika"}.` });
      const tocne = tocneSlike(k, (id) => R(id)?.rijec);
      if (!tocne.length) u.push({ gdje: g, poruka: `Nijedna slika ne počinje glasom ${k.slovo}.` });
      else if (tocne.length === k.slike.filter((x) => x !== null).length) u.push({ gdje: g, poruka: `Sve slike počinju glasom ${k.slovo}: nema ometača.` });
      const vidjeno = new Set<number>();
      for (const id of k.slike) { if (id === null) continue; if (vidjeno.has(id)) u.push({ gdje: g, poruka: `${ime(id)} je dvaput.` }); vidjeno.add(id); }
    });
    if (!pg.krugovi.length) u.push({ gdje: "zadatak", poruka: "Nema nijednog kruga." });
    return u;
  }
  if (v === "slogovi") {
    const sl = s as Slogovi;
    const pune = sl.slike.filter((x) => x.rijec_id !== null);
    if (!pune.length) u.push({ gdje: "zadatak", poruka: "Nema nijedne slike." });
    if (pune.length < sl.slike.length) u.push({ gdje: "slike", poruka: `${sl.slike.length - pune.length} prazn${sl.slike.length - pune.length === 1 ? "a slika" : "ih slika"}: u igri i na papiru se ne prikazuju.` });
    const vidjeno = new Set<number>();
    for (const x of pune) { if (vidjeno.has(x.rijec_id!)) u.push({ gdje: "slike", poruka: `${ime(x.rijec_id)} je dvaput.` }); vidjeno.add(x.rijec_id!); }
    if (sl.nacin === "duljina" && pune.length) {
      if (!pune.some((x) => jeDuga(x.slogova))) u.push({ gdje: "slike", poruka: "Nema nijedne dugačke riječi." });
      if (pune.every((x) => jeDuga(x.slogova))) u.push({ gdje: "slike", poruka: "Nema nijedne kratke riječi." });
    }
    if (sl.nacin !== "duljina") for (const x of pune) if (x.slogova > sl.krugova) u.push({ gdje: "slike", poruka: `${ime(x.rijec_id)} ima ${jedinica(sl.nacin, x.slogova)}, a krugova je ${sl.krugova}.` });
    for (const x of pune) { const r = R(x.rijec_id); const n = r ? izbroji(sl.nacin, r.rijec) : x.slogova; if (n !== x.slogova) u.push({ gdje: "slike", poruka: `${ime(x.rijec_id)}: upisano ${x.slogova}, a riječ po pravilu ima ${jedinica(sl.nacin, n)} (ako je ispravak namjeran, zanemari).` }); }
    return u;
  }
  if (v === "razvrstavanje") {
    const rz = s as Razvrstavanje;
    const P = PRAVILA_RAZVRSTAVANJA[rz.pravilo];
    const kat = (k: string | null, i: number) => k ?? `${i + 1}. (bez oznake)`;
    rz.kategorije.forEach((k, i) => { if (k === null) u.push({ gdje: "kategorije", poruka: `${i + 1}. kategorija nema oznaku.` }); });
    const pune = rz.slike.filter((x) => x.rijec_id !== null);
    if (!pune.length) u.push({ gdje: "zadatak", poruka: "Nema nijedne slike." });
    if (pune.length < rz.slike.length) u.push({ gdje: "slike", poruka: `${rz.slike.length - pune.length} prazn${rz.slike.length - pune.length === 1 ? "a slika" : "ih slika"}: u igri i na papiru se ne prikazuju.` });
    const vidjeno = new Set<number>();
    for (const x of pune) { if (vidjeno.has(x.rijec_id!)) u.push({ gdje: "slike", poruka: `${ime(x.rijec_id)} je dvaput.` }); vidjeno.add(x.rijec_id!); }
    rz.kategorije.forEach((k, i) => { if (pune.length && !pune.some((x) => x.kategorija === i)) u.push({ gdje: "kategorije", poruka: `U kategoriji ${kat(k, i)} nema nijedne slike.` }); });
    for (const x of pune) {
      const r = R(x.rijec_id);
      if (!r) continue;
      const k = kategorijaRijeci(rz.pravilo, r.rijec), upisana = rz.kategorije[x.kategorija];
      if (k === null) u.push({ gdje: "slike", poruka: `${ime(x.rijec_id)} nije jedna riječ: ne razvrstava se ${P.prema}.` });
      else if (upisana !== null && k !== upisana) u.push({ gdje: "slike", poruka: `${ime(x.rijec_id)} je u kategoriji ${upisana}, a ${P.prema} ide u ${k}${rz.kategorije.includes(k) ? "" : " (te kategorije nema)"}.` });
    }
    return u;
  }
  if (v === "koje_slovo") {
    const ks = s as KojeSlovo;
    if (!ks.stavke.length) u.push({ gdje: "zadatak", poruka: "Nema nijednog zadatka." });
    ks.stavke.forEach((st, i) => {
      const g = `stavka ${i + 1}`;
      if (!st.glas) u.push({ gdje: g, poruka: `${i + 1}. zadatak nema glas.` });
      else if (!st.ponudeno.includes(st.glas)) u.push({ gdje: g, poruka: `${i + 1}. zadatak: među slovima nema slova ${st.glas}.` });
      if (st.ponudeno.length < GRAFEMA_MIN) u.push({ gdje: g, poruka: `${i + 1}. zadatak ima samo ${st.ponudeno.length} slova (najmanje ${GRAFEMA_MIN}).` });
    });
    return u;
  }
  if (v === "pozicija_glasa") {
    const pg = s as PozicijaGlasa;
    if (!pg.glas) u.push({ gdje: "zadatak", poruka: "Odaberi glas." });
    const pune = pg.slike.filter((x) => x.rijec_id !== null);
    if (!pune.length) u.push({ gdje: "zadatak", poruka: "Nema nijedne slike." });
    if (pune.length < pg.slike.length) u.push({ gdje: "slike", poruka: `${pg.slike.length - pune.length} prazn${pg.slike.length - pune.length === 1 ? "a slika" : "ih slika"}: u igri i na papiru se ne prikazuju.` });
    const vidjeno = new Set<number>();
    for (const x of pune) { if (vidjeno.has(x.rijec_id!)) u.push({ gdje: "slike", poruka: `${ime(x.rijec_id)} je dvaput.` }); vidjeno.add(x.rijec_id!); }
    if (pg.glas) for (const x of pune) {
      const r = R(x.rijec_id);
      if (!r) continue;
      const f = fonemi(r.rijec).filter((y) => y === pg.glas).length;
      const p = pozicijaGlasa(pg.glas, r.rijec);
      if (!jednaRijec(r.rijec)) u.push({ gdje: "slike", poruka: `${ime(x.rijec_id)} nije jedna riječ.` });
      else if (f === 0) u.push({ gdje: "slike", poruka: `${ime(x.rijec_id)} nema glas ${pg.glas}.` });
      else if (f > 1) u.push({ gdje: "slike", poruka: `${ime(x.rijec_id)} ima glas ${pg.glas} ${f} puta: odgovor nije jednoznačan.` });
      else if (p !== null && p !== x.pozicija) u.push({ gdje: "slike", poruka: `${ime(x.rijec_id)}: označeno „${POZICIJE[x.pozicija].naziv}”, a glas ${pg.glas} je ${POZICIJE[p].gdje} (ako je ispravak namjeran, zanemari).` });
    }
    return u;
  }
  if (v === "percepcija") {
    const pc = s as Percepcija;
    const opis = (p: Polje) => `${ime(p.rijec_id)} (${IZMJENE[p.izmjena]})`;
    pc.stavke.forEach((x, i) => {
      const g = `Red ${i + 1}`;
      if (x.polja.some((p) => p.rijec_id === null)) { u.push({ gdje: g, poruka: "Nisu popunjene sve slike." }); return; }
      const ostala = x.polja.filter((_, j) => !x.tocno.includes(j));
      const tocna = x.tocno.map((j) => x.polja[j]);
      if (pc.trazi === "razlicitu") {
        if (ostala.some((p) => !istoPolje(p, ostala[0]))) u.push({ gdje: g, poruka: "Slike koje nisu označene nisu sve iste: različitih je više." });
        else if (istoPolje(tocna[0], ostala[0])) u.push({ gdje: g, poruka: `Označena slika je ista kao ostale: ${opis(tocna[0])}.` });
      } else {
        if (!istoPolje(tocna[0], tocna[1])) u.push({ gdje: g, poruka: "Dvije označene slike nisu iste." });
        const sve = [tocna[0], ...ostala];
        if (sve.some((p, a) => sve.some((q, b) => a < b && istoPolje(p, q)))) u.push({ gdje: g, poruka: "Osim označenog para postoji još jedan par istih slika." });
      }
    });
    if (!pc.stavke.length) u.push({ gdje: "zadatak", poruka: "Nema nijednog reda." });
    return u;
  }
  if (v === "odabir") {
    (s as Odabir).stavke.forEach((x, i) => {
      const g = `Red ${i + 1}`;
      if (x.zadana === null || x.ponudeno.some((p) => p === null)) { u.push({ gdje: g, poruka: "Nisu popunjene sve slike." }); return; }
      if (imaZnak([x.zadana, ...x.ponudeno])) return;
      if (!rim(x.zadana, x.ponudeno[x.tocno])) u.push({ gdje: g, poruka: `Točan odgovor: ${O.ne(ime(x.ponudeno[x.tocno]), ime(x.zadana))}.` });
      x.ponudeno.forEach((p, j) => { if (j !== x.tocno && rim(x.zadana, p)) u.push({ gdje: g, poruka: `I ${O.da(ime(p), ime(x.zadana))}: dva točna odgovora.` }); });
    });
  }
  if (v === "povezivanje") {
    const p = (s as Povezivanje).parovi;
    p.forEach((x, i) => {
      const g = `Par ${i + 1}`;
      if (x.lijevo === null || x.desno === null) { u.push({ gdje: g, poruka: "Par nije popunjen." }); return; }
      const zl = R(x.lijevo)?.znak, zd = R(x.desno)?.znak;
      if (zl || zd) {
        // Slovo i slika: par vrijedi ako riječ počinje glasom slova (LJULJAČKA počinje s LJ, ne s L).
        if (zl !== zd) {
          const znak = R(zl ? x.lijevo : x.desno)!, rij = R(zl ? x.desno : x.lijevo)!;
          if (prviGlas(rij.rijec) !== znak.rijec.toLocaleUpperCase("hr")) u.push({ gdje: g, poruka: `${ime(rij.id)} ne počinje glasom ${znak.rijec.toLocaleUpperCase("hr")}.` });
        }
        return;
      }
      if (!rim(x.lijevo, x.desno)) u.push({ gdje: g, poruka: `${O.ne(ime(x.lijevo), ime(x.desno))}.` });
      p.forEach((y, j) => { if (j !== i && rim(x.lijevo, y.desno)) u.push({ gdje: g, poruka: `${O.da(ime(x.lijevo), ime(y.desno))} (par ${j + 1}).` }); });
    });
    if (p.length < 3) u.push({ gdje: "zadatak", poruka: "Povezivanje treba barem 3 para." });
  }
  if (v === "uljez") {
    (s as Uljez).stavke.forEach((x, i) => {
      const g = `Red ${i + 1}`;
      if (x.slike.some((p) => p === null)) { u.push({ gdje: g, poruka: "Nisu popunjene sve slike." }); return; }
      if (imaZnak(x.slike)) return;
      const ostale = x.slike.filter((_, j) => j !== x.uljez);
      if (!rim(ostale[0], ostale[1]) || !rim(ostale[1], ostale[2])) u.push({ gdje: g, poruka: `Tri slike koje nisu uljez ${O.neSve}.` });
      if (ostale.some((o) => rim(o, x.slike[x.uljez]))) u.push({ gdje: g, poruka: `Uljez ${ime(x.slike[x.uljez])} ${O.daOstale}.` });
    });
  }
  return u;
}

// ---- Ocjenjivanje: broji se prvi pokušaj po stavci ----

export type Odgovor =
  | { stavka: number; odabrano: number; ms?: number }
  | { lijevo: number; desno: number; ms?: number }
  | { gumb: number; ms?: number };                  // scena: svaki dodir gumba, i krivi

export function ocijeni(v: Vrsta, s: Sadrzaj, odgovori: Odgovor[]): { tocnih: number; ukupno: number } {
  const prvi = new Map<number, number>();
  if (v === "odabir" || v === "uljez") {
    for (const o of odgovori) if ("stavka" in o && !prvi.has(o.stavka)) prvi.set(o.stavka, o.odabrano);
    const st = (s as Odabir | Uljez).stavke;
    const tocno = (i: number) => (v === "odabir" ? (st[i] as Odabir["stavke"][0]).tocno : (st[i] as Uljez["stavke"][0]).uljez);
    return { tocnih: st.filter((_, i) => prvi.get(i) === tocno(i)).length, ukupno: st.length };
  }
  if (v === "povezivanje") {
    const p = s as Povezivanje;
    for (const o of odgovori) if ("lijevo" in o && !prvi.has(o.lijevo)) prvi.set(o.lijevo, o.desno);
    return { tocnih: p.parovi.filter((_, i) => p.desno_redoslijed[prvi.get(i) ?? -1] === i).length, ukupno: p.parovi.length };
  }
  if (v === "prvi_glas") {
    // Krug je točan ako su pronađene sve slike s glasom bez ijednog krivog dodira.
    const kr = (s as PrviGlas).krugovi;
    return {
      tocnih: kr.filter((k, i) => {
        const moji = odgovori.flatMap((o) => ("stavka" in o && o.stavka === i ? [o.odabrano] : []));
        return k.tocno.length > 0 && k.tocno.every((t) => moji.includes(t)) && moji.every((m) => k.tocno.includes(m));
      }).length,
      ukupno: kr.length,
    };
  }
  if (v === "slogovi") {
    // Slika je točna ako je prvi odgovor dobar: boja (1 = dugačka, 0 = kratka) ili broj obojenih krugova.
    const sl = s as Slogovi;
    for (const o of odgovori) if ("stavka" in o && !prvi.has(o.stavka)) prvi.set(o.stavka, o.odabrano);
    const pune = sl.slike.map((x, i) => ({ ...x, i })).filter((x) => x.rijec_id !== null);
    return { tocnih: pune.filter((x) => prvi.get(x.i) === tocnoSlogovi(sl.nacin, x.slogova)).length, ukupno: pune.length };
  }
  if (v === "koje_slovo") {
    // Stavka je točna ako je prvi dodir bio na slovu glasa.
    const st = (s as KojeSlovo).stavke;
    for (const o of odgovori) if ("stavka" in o && !prvi.has(o.stavka)) prvi.set(o.stavka, o.odabrano);
    return { tocnih: st.filter((x, i) => x.glas !== null && x.ponudeno[prvi.get(i) ?? -1] === x.glas).length, ukupno: st.length };
  }
  if (v === "pozicija_glasa") {
    // `stavka` je indeks slike, `odabrano` krug (0 početak, 1 sredina, 2 kraj); broji se prvi dodir.
    const pg = s as PozicijaGlasa;
    for (const o of odgovori) if ("stavka" in o && !prvi.has(o.stavka)) prvi.set(o.stavka, o.odabrano);
    const pune = pg.slike.map((x, i) => ({ ...x, i })).filter((x) => x.rijec_id !== null);
    return { tocnih: pune.filter((x) => prvi.get(x.i) === x.pozicija).length, ukupno: pune.length };
  }
  if (v === "razvrstavanje") {
    // Slika je točna ako ju je dijete prvi put stavilo u pravu kategoriju.
    const rz = s as Razvrstavanje;
    for (const o of odgovori) if ("stavka" in o && !prvi.has(o.stavka)) prvi.set(o.stavka, o.odabrano);
    const pune = rz.slike.map((x, i) => ({ ...x, i })).filter((x) => x.rijec_id !== null);
    return { tocnih: pune.filter((x) => prvi.get(x.i) === x.kategorija).length, ukupno: pune.length };
  }
  if (v === "percepcija") {
    // Red je točan ako su pronađena sva točna polja bez ijednog krivog dodira.
    return {
      tocnih: (s as Percepcija).stavke.filter((x, i) => {
        const moji = odgovori.flatMap((o) => ("stavka" in o && o.stavka === i ? [o.odabrano] : []));
        return x.tocno.every((t) => moji.includes(t)) && moji.every((m) => x.tocno.includes(m));
      }).length,
      ukupno: (s as Percepcija).stavke.length,
    };
  }
  if (v === "scena") {
    // Svaki gumb je jedna odluka: točan treba dirnuti, ometač ne. Ometač dirnut i jednom je krivo.
    const dirnuti = new Set(odgovori.flatMap((o) => ("gumb" in o ? [o.gumb] : [])));
    const gumbi = (s as Scena).gumbi.map((g, i) => ({ ...g, i })).filter((g) => g.rijec_id !== null);
    return { tocnih: gumbi.filter((g) => g.tocno === dirnuti.has(g.i)).length, ukupno: gumbi.length };
  }
  return { tocnih: 0, ukupno: 0 };
}

// ---- Generator: složi zadatak iz kataloga po skupinama odnosa (rima, prvi glas…) ----

/**
 * `nacin`: inačica vrste s gumba predloška (slogovi: duljina | analiza, percepcija: razlicitu | par,
 * uparivanje, povezivanje i uljez: odnos iz odnosi.ts, zadano rima).
 * Po glasovima (logopedski mod): `cilj` je riječ s odabranim glasom. Prebrajanje uzima samo njih; kod rime
 * skupina mora imati takvu riječ i ona je zadana (lijeva) slika, ostale su slobodne. `slova` su krugovi prvog glasa.
 */
export interface Postavke {
  stavki: number; maxSlogova?: number; samoSaSlikom?: boolean; nacin?: string; cilj?: (r: RijecZadatka) => boolean; slova?: string[];
  /** Uparivanje, povezivanje, uljez po glasovima: jedan uvjet po odabranom glasu; redovi idu redom po glasovima (`poCiljevima`). */
  ciljevi?: ((r: RijecZadatka) => boolean)[];
}
/** Povezivanje po glasovima: do 8 parova (koliko editor dopušta), inače generator slaže do 6. */
export const MAX_PAROVA = 8;

/**
 * Koliko stavki složiti pri izradi iz predloška i u „Složi automatski” (redova, parova, slika, krugova).
 * Granice su iste kao u `normaliziraj`, zadano stane na jednu stranicu. Scena nema broja: slaže je logoped.
 */
export const BROJ_STAVKI: Partial<Record<Vrsta, { naziv: string; min: number; max: number; zadano: number }>> = {
  odabir: { naziv: "Broj redova", min: 1, max: MAX_REDOVA, zadano: 4 },
  uljez: { naziv: "Broj redova", min: 1, max: MAX_REDOVA, zadano: 4 },
  percepcija: { naziv: "Broj redova", min: 1, max: MAX_REDOVA, zadano: 4 },
  povezivanje: { naziv: "Broj parova", min: 2, max: MAX_PAROVA, zadano: 4 },
  prvi_glas: { naziv: "Broj krugova", min: 1, max: MAX_REDOVA, zadano: 4 },
  slogovi: { naziv: "Broj slika", min: 2, max: SLOGOVI_SLIKA_MAX, zadano: 8 },
  razvrstavanje: { naziv: "Broj slika", min: 4, max: RAZVRSTAVANJE_SLIKA_MAX, zadano: 8 },
  koje_slovo: { naziv: "Broj zadataka", min: 1, max: KOJE_SLOVO_MAX, zadano: 4 },
  pozicija_glasa: { naziv: "Broj slika", min: 3, max: POZICIJA_SLIKA_MAX, zadano: 6 },
  listic: { naziv: "Broj slika", min: 1, max: MAX_KARTICA_LISTICA, zadano: 12 },
};
/** Broj stavki iz obrasca, unutar granica vrste (prazno ili krivo = zadano). */
export function brojStavki(v: Vrsta, ulaz: unknown): number {
  const b = BROJ_STAVKI[v];
  if (!b) return 4;
  const n = Math.round(Number(ulaz));
  return Number.isFinite(n) && n > 0 ? Math.max(b.min, Math.min(b.max, n)) : b.zadano;
}
/** Koliko stavki zadatak već ima (da „Složi” zadrži broj). */
export function brojUZadatku(v: Vrsta, s: Sadrzaj): number {
  const x = s as unknown as Record<string, unknown[] | undefined>;
  const n = (v === "povezivanje" ? x.parovi : v === "listic" ? x.kartice : v === "prvi_glas" ? x.krugovi : v === "slogovi" || v === "razvrstavanje" || v === "pozicija_glasa" ? x.slike : x.stavke)?.length ?? 0;
  return n ? brojStavki(v, n) : BROJ_STAVKI[v]?.zadano ?? 4;
}

function promijesaj<T>(a: T[], rnd: () => number): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

export function slozi(v: Vrsta, rijeci: RijecZadatka[], p: Postavke, rnd: () => number = Math.random): Sadrzaj {
  const odnos: Odnos = jeOdnos(p.nacin) ? p.nacin : "rima";
  const K = (r: RijecZadatka) => kljuc(odnos, r);
  // Riječ i slika: riječ mora imati sliku, a skupina je ista riječ dvaput (napisana i slika, napisano.ts).
  const ista = odnos === "ista_rijec";
  const dobre = rijeci.filter((r) => K(r) && (!p.maxSlogova || r.slogova <= p.maxSlogova) && (!(p.samoSaSlikom || ista) || r.slika));
  const skupine = new Map<string, RijecZadatka[]>();
  for (const r of dobre) skupine.set(K(r)!, ista ? [r, r] : [...(skupine.get(K(r)!) ?? []), r]);
  const cilj = p.cilj;
  const vecih = (n: number) => promijesaj([...skupine.entries()].filter(([, g]) => g.length >= n && (!cilj || g.some(cilj))), rnd);
  // Riječi skupine s glasom prve (zadana, lijeva), redom kako su izmiješane.
  const ciljPrvi = (g: RijecZadatka[]) => (cilj ? [...g.filter(cilj), ...g.filter((r) => !cilj(r))] : g);
  const izvan = (k: string, n: number) => promijesaj(dobre.filter((r) => K(r) !== k), rnd).slice(0, n);
  const n = brojStavki(v, p.stavki);
  // Skupine za redove: po odabranim glasovima (zadana slika ima glas tog reda) ili nasumične.
  const izbor = (min: number, koliko: number): [string, RijecZadatka[]][] => {
    const c = p.ciljevi;
    if (!c?.length) return vecih(min).slice(0, koliko).map(([k, g]) => [k, ciljPrvi(promijesaj(g, rnd))]);
    // Skupina se dijeli na više redova po `min` riječi; red počinje riječju s glasom (poCiljevima).
    return poCiljevima(vecih(min).map(([, g]) => promijesaj(g, rnd)), c, koliko, min).map(({ skupina }) => [K(skupina[0])!, skupina]);
  };

  if (v === "scena") return prazno("scena");   // scenu slaže logoped: slike ovise o pozadini
  if (v === "slogovi") return slozSlogove(NACINI_SLOGOVA.includes(p.nacin as NacinSlogova) ? (p.nacin as NacinSlogova) : "duljina", cilj ? rijeci.filter(cilj) : rijeci, p.stavki, 4, rnd);
  if (v === "koje_slovo") return slozKojeSlovo(n, p.slova, rnd);
  if (v === "pozicija_glasa") return slozPozicije(p.slova?.[0] ?? null, rijeci, n, rnd);
  if (v === "razvrstavanje") return slozRazvrstavanje(jePraviloRazvrstavanja(p.nacin) ? p.nacin : "prvi_glas", rijeci, n, { slova: p.slova, cilj }, rnd);
  if (v === "prvi_glas") {
    // Slova za koja katalog ima dovoljno slika, svako jednom; krugova koliko traži `stavki` (do 6).
    const jedne = rijeci.filter((r) => jednaRijec(r.rijec)), sa = jedne.filter((r) => r.slika);
    const izvor = sa.length >= SLIKA_MIN ? sa : jedne;
    const ima = (sl: string, koliko: number) => izvor.filter((r) => prviGlas(r.rijec) === sl).length >= koliko;
    // Odabrana slova (po glasovima) redom kako su zadana, ako katalog ima barem jednu riječ; inače nasumična s 3+.
    const slova = p.slova ? ABECEDA.filter((sl) => p.slova!.includes(sl) && ima(sl, 1)).slice(0, 6)
      : promijesaj(ABECEDA.filter((sl) => ima(sl, 3)), rnd).slice(0, n);
    return { kolo: [...ABECEDA], krugovi: (slova.length ? slova : [null]).map((sl) => slozKrug(sl, izvor, SLIKA_MIN, rnd)) };
  }
  if (v === "percepcija") {
    // Riječi sa slikom (bez slike je red riječi, što nije vizualni zadatak), svaka jednom.
    const izbor = promijesaj(rijeci.filter((r) => r.slika), rnd).slice(0, n);
    const trazi: Trazi = p.nacin === "par" ? "par" : "razlicitu";
    return { trazi, stavke: (izbor.length ? izbor : [null]).map((r) => slozRed(r?.id ?? null, 4, trazi, rnd)) };
  }
  if (v === "listic") {
    return { kartice: promijesaj(dobre, rnd).slice(0, n).map((r) => ({ rijec_id: r.id, tekst: r.rijec.toLocaleUpperCase("hr") })), raspored: "auto" };
  }
  if (v === "odabir") {
    const stavke = izbor(2, n).map(([rima, g]) => {
      const [zadana, tocan] = g;
      const ponudeno = promijesaj([tocan, ...izvan(rima, PONUDENIH - 1)], rnd);
      // Riječ i slika: zadana je napisana riječ, ponuđene su slike.
      return { zadana: ista ? -zadana.id : zadana.id, ponudeno: ponudeno.map((r) => r.id), tocno: ponudeno.indexOf(tocan) };
    });
    return { odnos, stavke };
  }
  if (v === "povezivanje") {
    let skup = izbor(2, n);
    // Po glasovima: ako su svi parovi iz iste skupine (samo C, prvi glas), svaka lijeva ide uz svaku desnu i
    // dijete može povezati bilo kako (zadatak 148). Tada jedan par s glasom, ostali iz drugih skupina.
    if (p.ciljevi?.length && skup.length > 1 && new Set(skup.map(([k]) => k)).size < 2) {
      const k0 = skup[0][0];
      skup = promijesaj([skup[0], ...vecih(2).filter(([k]) => k !== k0).slice(0, n - 1).map(([k, g]) => [k, promijesaj(g, rnd)] as [string, RijecZadatka[]])], rnd);
    }
    const parovi = skup.map(([, [a, b]]) => ({ lijevo: a.id, desno: ista ? -b.id : b.id }));
    let red = promijesaj(parovi.map((_, i) => i), rnd);
    // Desni stupac ne smije biti u istom redoslijedu kao lijevi.
    if (red.length > 1 && red.every((x, i) => x === i)) red = [...red.slice(1), red[0]];
    return { odnos, parovi, desno_redoslijed: red };
  }
  const stavke = izbor(3, n).map(([rima, g]) => {
    const tri = g.slice(0, 3);
    const uljez = izvan(rima, 1)[0];
    const slike = promijesaj([...tri, uljez], rnd);
    return { slike: slike.map((r) => r.id), uljez: slike.indexOf(uljez) };
  });
  return { odnos, stavke };
}

/**
 * Krug za slovo: 3–5 slika koje počinju glasom (koliko ih katalog ima), ostalo ometači s
 * drugim prvim glasom, svaka riječ jednom, redoslijed nasumičan.
 */
export function slozKrug(slovo: string | null, rijeci: RijecZadatka[], n = SLIKA_MIN, rnd: () => number = Math.random): Krug {
  n = Math.max(SLIKA_MIN, Math.min(SLIKA_MAX, n));
  if (!slovo) return { slovo: null, slike: Array(n).fill(null), tocno: [] };
  rijeci = rijeci.filter((r) => jednaRijec(r.rijec));
  const s = promijesaj(rijeci.filter((r) => prviGlas(r.rijec) === slovo), rnd);
  const ostale = promijesaj(rijeci.filter((r) => { const g = prviGlas(r.rijec); return g !== null && g !== slovo; }), rnd);
  const koliko = Math.min(s.length, 3 + Math.floor(rnd() * 3));
  const izbor = promijesaj([...s.slice(0, koliko), ...ostale.slice(0, n - koliko)], rnd);
  const slike: Id[] = [...izbor.map((r) => r.id), ...Array(Math.max(0, n - izbor.length)).fill(null)];
  const m = new Map(rijeci.map((r) => [r.id, r.rijec]));
  return { slovo, slike, tocno: tocneSlike({ slovo, slike }, (id) => m.get(id)) };
}

/** Točan odgovor za sliku slogova: boja (1 = dugačka, 0 = kratka) ili broj krugova. */
export const tocnoSlogovi = (nacin: NacinSlogova, slogova: number) => (nacin === "duljina" ? (jeDuga(slogova) ? 1 : 0) : slogova);

/**
 * Slike za slogove iz kataloga (sa slikom ako ih ima dovoljno), svaka riječ jednom.
 * `duljina`: pola kratkih (1–2 sloga), pola dugačkih (3+, prednost 4+ radi jasne razlike).
 * `analiza`: podjednako riječi od 1 do `krugova` slogova.
 * `glasovi`: podjednako riječi od 3 do 7 glasova.
 * `krugova` je barem zadani, a raste do najduže izabrane riječi.
 */
export function slozSlogove(nacin: NacinSlogova, rijeci: RijecZadatka[], n: number, krugova = 4, rnd: () => number = Math.random): Slogovi {
  n = Math.max(2, Math.min(SLOGOVI_SLIKA_MAX, n));
  rijeci = rijeci.filter((r) => jednaRijec(r.rijec));
  const sa = rijeci.filter((r) => r.slika);
  const izvor = sa.length >= n * 2 ? sa : rijeci;
  const skupine = new Map<number, RijecZadatka[]>();
  const broj = (r: RijecZadatka) => (nacin === "glasovi" ? brojGlasova(r.rijec) : r.slogova);
  for (const r of promijesaj(izvor, rnd)) { const k = Math.min(broj(r), SLOGOVA_MAX); skupine.set(k, [...(skupine.get(k) ?? []), r]); }
  // Kružno po skupinama: iz svake po jedna, dok ne skupi n.
  const kruzno = (kljucevi: number[], koliko: number) => {
    const g = kljucevi.map((k) => [...(skupine.get(k) ?? [])]);
    const out: RijecZadatka[] = [];
    while (out.length < koliko && g.some((x) => x.length)) for (const x of g) { const r = x.shift(); if (r && out.length < koliko) out.push(r); }
    return out;
  };
  let izbor: RijecZadatka[];
  if (nacin === "duljina") {
    const kratkih = Math.ceil(n / 2);
    const duge = kruzno([4, 5, 6, 3], n - kratkih);
    izbor = [...kruzno([1, 2], n - duge.length), ...duge];
  } else if (nacin === "glasovi") {
    izbor = kruzno([3, 4, 5, 6, 7], n);
  } else {
    izbor = kruzno(Array.from({ length: krugova }, (_, i) => i + 1), n);
  }
  const slike = promijesaj(izbor, rnd).map((r) => ({ rijec_id: r.id, slogova: broj(r) }));
  return { nacin, krugova: krugovaZa(slike, krugova), slike };
}

/**
 * Razvrstavanje iz kataloga: 2 kategorije (od 9 slika 3) s dovoljno riječi (sa slikom ako ih ima dovoljno),
 * slike ravnomjerno po kategorijama, svaka riječ jednom, redoslijed slika nasumičan.
 * Po glasovima: `slova` (prvi/zadnji glas) su kategorije redom; s jednim slovom druga je nasumična.
 * `cilj` (po glasovima kod broja slogova/glasova): samo riječi s odabranim glasom.
 * Brojevi su poredani uzlazno, a kod broja slogova i glasova kategorije su susjedne kad može (2 i 3, ne 1 i 4).
 */
export function slozRazvrstavanje(pravilo: PraviloRazvrstavanja, rijeci: RijecZadatka[], n: number,
  o: { slova?: string[]; cilj?: (r: RijecZadatka) => boolean; kategorija?: number } = {}, rnd: () => number = Math.random): Razvrstavanje {
  n = Math.max(BROJ_STAVKI.razvrstavanje!.min, Math.min(RAZVRSTAVANJE_SLIKA_MAX, n));
  const broj = PRAVILA_RAZVRSTAVANJA[pravilo].broj;
  let izvor = rijeci.filter((r) => !r.znak && kategorijaRijeci(pravilo, r.rijec) !== null && (!broj || !o.cilj || o.cilj(r)));
  const sa = izvor.filter((r) => r.slika);
  if (sa.length >= n) izvor = sa;
  const skupine = new Map<string, RijecZadatka[]>();
  for (const r of promijesaj(izvor, rnd)) { const k = kategorijaRijeci(pravilo, r.rijec)!; skupine.set(k, [...(skupine.get(k) ?? []), r]); }
  const koliko = Math.max(KATEGORIJA_MIN, Math.min(KATEGORIJA_MAX, o.kategorija ?? (n >= 9 ? 3 : 2)));
  const treba = Math.ceil(n / koliko);
  const dosta = (k: string, m = treba) => (skupine.get(k)?.length ?? 0) >= m;
  let kategorije: string[];
  const zadana = (o.slova ?? []).filter((x) => !broj && ABECEDA.includes(x) && dosta(x, 1)).slice(0, KATEGORIJA_MAX);
  if (zadana.length) {
    const ostale = promijesaj([...skupine.keys()].filter((k) => !zadana.includes(k) && dosta(k)), rnd);
    kategorije = [...zadana, ...ostale].slice(0, Math.max(KATEGORIJA_MIN, zadana.length));
  } else if (broj) {
    // Susjedni brojevi (2 i 3 sloga), početak nasumičan među onima koji imaju dovoljno.
    const ima = [...skupine.keys()].map(Number).filter((k) => dosta(String(k))).sort((a, b) => a - b);
    const nizovi = ima.filter((k) => Array.from({ length: koliko }, (_, j) => k + j).every((x) => ima.includes(x)));
    const pocetak = nizovi.length ? nizovi[Math.floor(rnd() * nizovi.length)] : null;
    kategorije = (pocetak !== null ? Array.from({ length: koliko }, (_, j) => pocetak + j) : ima.slice(0, koliko)).map(String);
  } else {
    kategorije = promijesaj([...skupine.keys()].filter((k) => dosta(k)), rnd).slice(0, koliko);
  }
  // Premalo skupina s dovoljno riječi: dopuni najvećima (ravnomjernost je manja, ali zadatak je cijeli).
  if (kategorije.length < KATEGORIJA_MIN) {
    const najvece = [...skupine.entries()].filter(([k]) => !kategorije.includes(k)).sort((x, y) => y[1].length - x[1].length).map(([k]) => k);
    kategorije = [...kategorije, ...najvece].slice(0, koliko);
  }
  if (broj) kategorije.sort((a, b) => Number(a) - Number(b));
  // Kružno po kategorijama dok ne skupi n slika.
  const g = kategorije.map((k) => [...(skupine.get(k) ?? [])]);
  const izbor: SlikaRazvrstavanja[] = [];
  while (izbor.length < n && g.some((x) => x.length)) g.forEach((x, i) => { const r = x.shift(); if (r && izbor.length < n) izbor.push({ rijec_id: r.id, kategorija: i }); });
  const sve: (string | null)[] = kategorije.length >= KATEGORIJA_MIN ? kategorije : [...kategorije, ...Array(KATEGORIJA_MIN - kategorije.length).fill(null)];
  return { pravilo, tema: "vrece", kategorije: sve, slike: promijesaj(izbor, rnd) };
}

/** Uputa pozicije za papir s glasom („Gdje čuješ glas S u riječi? …”); bez glasa općenita. */
export const uputaPozicije = (glas: string | null) => UPUTE_POZICIJE.ispis.replace("glas {glas}", glas ? `glas ${glas}` : "glas");

/**
 * Koje slovo čuješ iz abecede: n različitih glasova (po glasovima: odabrana slova redom, pa ponavljanje
 * ako ih je manje od n), svaki s `GRAFEMA_ZADANO` slova (`slozPonudeno`: slična slova prva).
 */
export function slozKojeSlovo(n: number, slova: string[] | undefined, rnd: () => number = Math.random, grafema = GRAFEMA_ZADANO): KojeSlovo {
  n = Math.max(1, Math.min(KOJE_SLOVO_MAX, n));
  const zadana = [...new Set((slova ?? []).filter((x) => ABECEDA.includes(x)))];
  const glasovi = zadana.length ? Array.from({ length: n }, (_, i) => zadana[i % zadana.length]) : promijesaj(ABECEDA, rnd).slice(0, n);
  // Zadani glasovi (Po glasovima…) su jedni drugima ometači: svi stanu među slova, uz barem 2 druga.
  if (zadana.length > 1) grafema = Math.max(grafema, Math.min(GRAFEMA_MAX, zadana.length + 2));
  return { slova: "velika", grafema, stavke: glasovi.map((glas) => ({ glas, ponudeno: slozPonudeno(glas, grafema, rnd, zadana) })) };
}

/**
 * Pozicija glasa iz kataloga: riječi s glasom točno jednom, ravnomjerno po početku, sredini i kraju
 * (kružno, pozicija bez riječi se preskače), slika ako ih ima dovoljno, redoslijed nasumičan.
 * Bez zadanog glasa: nasumičan glas koji ima riječi na sve tri pozicije (ili najviše riječi).
 */
export function slozPozicije(glas: string | null, rijeci: RijecZadatka[], n: number, rnd: () => number = Math.random): PozicijaGlasa {
  n = Math.max(BROJ_STAVKI.pozicija_glasa!.min, Math.min(POZICIJA_SLIKA_MAX, n));
  const jedne = rijeci.filter((r) => !r.znak && jednaRijec(r.rijec));
  const po = (g: string) => {
    let izvor = jedne.filter((r) => pozicijaGlasa(g, r.rijec) !== null);
    const sa = izvor.filter((r) => r.slika);
    if (sa.length >= n) izvor = sa;
    const g3: RijecZadatka[][] = [[], [], []];
    for (const r of promijesaj(izvor, rnd)) g3[pozicijaGlasa(g, r.rijec)!].push(r);
    return g3;
  };
  if (!glas || !ABECEDA.includes(glas)) {
    const ocjena = (g: string) => { const g3 = po(g); return g3.filter((x) => x.length >= Math.ceil(n / 3)).length * 1000 + g3.reduce((a, x) => a + x.length, 0); };
    const kandidati = promijesaj(ABECEDA, rnd).map((g) => ({ g, o: ocjena(g) }));
    const naj = Math.max(...kandidati.map((k) => Math.floor(k.o / 1000)));
    glas = kandidati.find((k) => Math.floor(k.o / 1000) === naj)?.g ?? "S";
  }
  const g3 = po(glas);
  const slike: SlikaPozicije[] = [];
  while (slike.length < n && g3.some((x) => x.length)) for (const p of [0, 1, 2] as Pozicija[]) { const r = g3[p].shift(); if (r && slike.length < n) slike.push({ rijec_id: r.id, pozicija: p }); }
  return { glas, slike: promijesaj(slike, rnd) };
}
