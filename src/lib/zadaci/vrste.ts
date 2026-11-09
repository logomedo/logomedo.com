// Vrste zadataka (docs/zadaci.md). Vrsta je mehanika (odaberi, poveži, pronađi uljeza,
// listić, vizualna percepcija), a odnos (zasad samo rima) je parametar sadržaja. Točan odgovor je spremljen u
// sadržaju; odnos služi generatoru i upozorenjima u editoru, ne ocjenjivanju.
//
// Čisti TS: koriste ga API (provjera ulaza), editor i prikaz u pregledniku te testovi.

import { brojSlogova, rimujuSe } from "./rima.ts";
import { fonemi } from "../fonemi.ts";

export type Vrsta = "listic" | "odabir" | "povezivanje" | "uljez" | "scena" | "percepcija" | "prvi_glas" | "slogovi";
export type Odnos = "rima";
type Id = number | null;

/**
 * `raspored`: `auto` = veličina slika prema broju slika na stranici (4 slike → 2 × 2 velike),
 * `3x4` = uvijek 3 stupca × 4 reda kao stari LogoMedo (zadano za listiće bez polja).
 */
export type RasporedListica = "auto" | "3x4";
export interface Listic { kartice: { rijec_id: Id; tekst: string }[]; raspored?: RasporedListica }
/** Najviše kartica na jednoj A4 stranici listića. */
export const LISTIC_PO_STRANICI = 12;
/**
 * Mreža stranice listića s `n` kartica u prostoru `W` × `H` mm (razmak `g`, `tekst` mm ispod slike):
 * broj stupaca koji daje najveću sliku (kod jednake, manje praznih mjesta). Isto računaju PDF i HTML ispis.
 */
export function rasporedListica(n: number, raspored: RasporedListica | undefined, W: number, H: number, g = 7, tekst = 9): { stupaca: number; redova: number; s: number } {
  const velicina = (c: number, r: number) => Math.min((W - (c - 1) * g) / c, (H - (r - 1) * g) / r - tekst);
  if (raspored !== "auto") return { stupaca: 3, redova: 4, s: velicina(3, 4) };
  n = Math.max(1, Math.min(LISTIC_PO_STRANICI, n));
  let naj = { stupaca: 1, redova: n, s: -Infinity };
  for (let c = 1; c <= 4; c++) {
    const r = Math.ceil(n / c), s = velicina(c, r);
    if (s > naj.s + 0.5 || (Math.abs(s - naj.s) <= 0.5 && c * r < naj.stupaca * naj.redova)) naj = { stupaca: c, redova: r, s };
  }
  return naj;
}
export interface Odabir { odnos: Odnos; stavke: { zadana: Id; ponudeno: Id[]; tocno: number }[] }
/** `desno_redoslijed[k]` = indeks para čija je desna slika na k-tom mjestu desnog stupca. */
export interface Povezivanje { odnos: Odnos; parovi: { lijevo: Id; desno: Id }[]; desno_redoslijed: number[] }
export interface Uljez { odnos: Odnos; stavke: { slike: Id[]; uljez: number }[] }
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
 * Slogovi (artikulacija, slogovna svjesnost), dva načina iste mehanike „slika + broj slogova”:
 * `duljina`: dijete jednom bojom zaokruži dugačke riječi (od `DUGA_OD` slogova), drugom kratke.
 * `analiza`: ispod slike je `krugova` krugova, dijete oboji onoliko koliko riječ ima slogova.
 * `slogova` se pri odabiru slike računa iz riječi (`brojSlogova`), a logoped ga može ispraviti.
 */
export type NacinSlogova = "duljina" | "analiza";
export interface SlikaSlogova { rijec_id: Id; slogova: number }
export interface Slogovi { nacin: NacinSlogova; krugova: number; slike: SlikaSlogova[] }
/** Dugačka riječ ima barem 3 sloga (KRAVA je kratka, KORNJAČA dugačka). */
export const DUGA_OD = 3;
export const jeDuga = (slogova: number) => slogova >= DUGA_OD;
export const SLOGOVA_MAX = 6, KRUGOVA_MIN = 3, KRUGOVA_MAX = 6, SLOGOVI_SLIKA_MAX = 24;
/** Boje bojica: iste na ekranu, u legendi ispisa i u PDF-u. */
export const BOJE_DULJINE = {
  duga: { naziv: "dugačka", boja: "#d62828", bojom: "crvenom" },
  kratka: { naziv: "kratka", boja: "#1f6fd1", bojom: "plavom" },
} as const;
export const UPUTE_SLOGOVA: Record<NacinSlogova, { ekran: string; ispis: string }> = {
  duljina: { ekran: "Dugačke riječi oboji crvenom, a kratke plavom bojicom.", ispis: "Dugačke riječi zaokruži crvenom bojom, a kratke plavom." },
  analiza: { ekran: "Koliko slogova ima riječ? Oboji toliko krugova.", ispis: "Izgovori riječ i pljesni na svaki slog. Oboji onoliko krugova koliko riječ ima slogova." },
};
export type Sadrzaj = Listic | Odabir | Povezivanje | Uljez | Scena | Percepcija | PrviGlas | Slogovi;

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
export interface RijecZadatka { id: number; rijec: string; rima: string | null; slogova: number; slika: string | null; slike?: SlikeRijeci }

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
    naziv: "Slogovi", opis: "Dugačke i kratke riječi (dijete ih zaokruži dvjema bojama) ili slogovna analiza (ispod slike oboji onoliko krugova koliko riječ ima slogova).",
    uputa: UPUTE_SLOGOVA.duljina.ispis, ispis: "Zaokruži bojama / oboji krugove", odnos: false,
  },
  odabir: {
    naziv: "Uparivanje", opis: "Zadana je jedna slika, ispod su tri. Jedna se rimuje sa zadanom: dijete je odabire.",
    uputa: "Koja se slika rimuje s prvom? Zaokruži je.", ispis: "Zaokruži", odnos: true,
  },
  povezivanje: {
    naziv: "Povezivanje", opis: "Dva stupca slika. Svaka slika lijevo ima par desno s kojim se rimuje: dijete ih povezuje.",
    uputa: "Poveži slike koje se rimuju.", ispis: "Poveži crtom", odnos: true,
  },
  uljez: {
    naziv: "Izbaci uljeza", opis: "Četiri slike u redu: tri se rimuju, jedna ne. Dijete pronalazi uljeza.",
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
};

/** Zadana uputa za papir; percepcija ovisi o tome traži li se različita ili par. */
export function zadanaUputa(v: Vrsta, s?: Sadrzaj): string {
  if (v === "percepcija" && s) return UPUTE_PERCEPCIJE[(s as Percepcija).trazi].ispis;
  if (v === "slogovi" && s) return UPUTE_SLOGOVA[(s as Slogovi).nacin].ispis;
  return VRSTE[v].uputa;
}
export const jeVrsta = (v: unknown): v is Vrsta => typeof v === "string" && v in VRSTE;

export const PONUDENIH = 3;
export const U_REDU = 4;
/** Gumba na sceni: vodoravno stanu u jedan red, uspravno u dva. */
export const MAX_GUMBA = 10;
/** Najviše redova u odabiru, uljezu i percepciji (PDF ih lomi po 3 na A4). Server reže višak, pa ga ni editor ne nudi. */
export const MAX_REDOVA = 30;

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
const niz = <T>(x: unknown, max: number, f: (e: unknown) => T): T[] => (Array.isArray(x) ? x.slice(0, max).map(f) : []);
const obj = (x: unknown) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
const ind = (x: unknown, n: number) => (Number.isInteger(x) && (x as number) >= 0 && (x as number) < n ? (x as number) : 0);
const tocnoN = <T>(a: T[], n: number, f: () => T) => [...a.slice(0, n), ...Array.from({ length: Math.max(0, n - a.length) }, f)];

/** Iz bilo čega napravi ispravan sadržaj vrste; nepoznato odbacuje. */
export function normaliziraj(v: Vrsta, ulaz: unknown): Sadrzaj {
  const o = obj(ulaz);
  switch (v) {
    case "listic":
      return { kartice: niz(o.kartice, 60, (k) => ({ rijec_id: id(obj(k).rijec_id), tekst: String(obj(k).tekst ?? "").slice(0, 200) })), raspored: o.raspored === "auto" ? "auto" : "3x4" };
    case "odabir":
      return {
        odnos: "rima",
        stavke: niz(o.stavke, MAX_REDOVA, (s) => {
          const x = obj(s);
          return { zadana: id(x.zadana), ponudeno: tocnoN(niz(x.ponudeno, PONUDENIH, id), PONUDENIH, () => null), tocno: ind(x.tocno, PONUDENIH) };
        }),
      };
    case "povezivanje": {
      const parovi = niz(o.parovi, 8, (p) => ({ lijevo: id(obj(p).lijevo), desno: id(obj(p).desno) }));
      const r = niz(o.desno_redoslijed, 8, (x) => Number(x));
      const ok = r.length === parovi.length && [...r].sort((a, b) => a - b).every((x, i) => x === i);
      return { odnos: "rima", parovi, desno_redoslijed: ok ? r : parovi.map((_, i) => i) };
    }
    case "uljez":
      return {
        odnos: "rima",
        stavke: niz(o.stavke, MAX_REDOVA, (s) => {
          const x = obj(s);
          return { slike: tocnoN(niz(x.slike, U_REDU, id), U_REDU, () => null), uljez: ind(x.uljez, U_REDU) };
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
        nacin: o.nacin === "analiza" ? "analiza" : "duljina",
        krugova: Number.isInteger(k) ? Math.max(KRUGOVA_MIN, Math.min(KRUGOVA_MAX, k)) : 4,
        slike: niz(o.slike, SLOGOVI_SLIKA_MAX, (x) => {
          const n = Number(obj(x).slogova);
          return { rijec_id: id(obj(x).rijec_id), slogova: Number.isInteger(n) ? Math.max(1, Math.min(SLOGOVA_MAX, n)) : 1 };
        }),
      };
    }
  }
}

/** Svi id-jevi riječi u sadržaju (za dohvat slika). */
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
  return [...new Set(out.filter((x): x is number => x !== null))];
}

// ---- Provjere za editor: zadatak se smije spremiti i s upozorenjima ----

export interface Upozorenje { gdje: string; poruka: string }

export function provjeri(v: Vrsta, s: Sadrzaj, rijeci: Map<number, RijecZadatka>): Upozorenje[] {
  const u: Upozorenje[] = [];
  const R = (x: Id) => (x === null ? null : rijeci.get(x) ?? null);
  const ime = (x: Id) => R(x)?.rijec.toLocaleUpperCase("hr") ?? "?";
  const rim = (a: Id, b: Id) => { const x = R(a), y = R(b); return !!x && !!y && rimujuSe(x, y); };
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
    if (sl.nacin === "analiza") for (const x of pune) if (x.slogova > sl.krugova) u.push({ gdje: "slike", poruka: `${ime(x.rijec_id)} ima ${x.slogova} sloga, a krugova je ${sl.krugova}.` });
    for (const x of pune) { const r = R(x.rijec_id); if (r && brojSlogova(r.rijec) !== x.slogova) u.push({ gdje: "slike", poruka: `${ime(x.rijec_id)}: upisano ${x.slogova}, a riječ po pravilu ima ${brojSlogova(r.rijec)} sloga (ako je ispravak namjeran, zanemari).` }); }
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
      if (!rim(x.zadana, x.ponudeno[x.tocno])) u.push({ gdje: g, poruka: `Točan odgovor ${ime(x.ponudeno[x.tocno])} se ne rimuje s ${ime(x.zadana)}.` });
      x.ponudeno.forEach((p, j) => { if (j !== x.tocno && rim(x.zadana, p)) u.push({ gdje: g, poruka: `${ime(p)} se također rimuje s ${ime(x.zadana)}: dva točna odgovora.` }); });
    });
  }
  if (v === "povezivanje") {
    const p = (s as Povezivanje).parovi;
    p.forEach((x, i) => {
      const g = `Par ${i + 1}`;
      if (x.lijevo === null || x.desno === null) { u.push({ gdje: g, poruka: "Par nije popunjen." }); return; }
      if (!rim(x.lijevo, x.desno)) u.push({ gdje: g, poruka: `${ime(x.lijevo)} i ${ime(x.desno)} se ne rimuju.` });
      p.forEach((y, j) => { if (j !== i && rim(x.lijevo, y.desno)) u.push({ gdje: g, poruka: `${ime(x.lijevo)} se rimuje i s ${ime(y.desno)} (par ${j + 1}).` }); });
    });
    if (p.length < 3) u.push({ gdje: "zadatak", poruka: "Povezivanje treba barem 3 para." });
  }
  if (v === "uljez") {
    (s as Uljez).stavke.forEach((x, i) => {
      const g = `Red ${i + 1}`;
      if (x.slike.some((p) => p === null)) { u.push({ gdje: g, poruka: "Nisu popunjene sve slike." }); return; }
      const ostale = x.slike.filter((_, j) => j !== x.uljez);
      if (!rim(ostale[0], ostale[1]) || !rim(ostale[1], ostale[2])) u.push({ gdje: g, poruka: "Tri slike koje nisu uljez se ne rimuju sve međusobno." });
      if (ostale.some((o) => rim(o, x.slike[x.uljez]))) u.push({ gdje: g, poruka: `Uljez ${ime(x.slike[x.uljez])} se rimuje s ostalima.` });
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

// ---- Generator: složi zadatak iz kataloga po skupinama rime ----

export interface Postavke { stavki: number; maxSlogova?: number; samoSaSlikom?: boolean }

function promijesaj<T>(a: T[], rnd: () => number): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

export function slozi(v: Vrsta, rijeci: RijecZadatka[], p: Postavke, rnd: () => number = Math.random): Sadrzaj {
  const dobre = rijeci.filter((r) => r.rima && (!p.maxSlogova || r.slogova <= p.maxSlogova) && (!p.samoSaSlikom || r.slika));
  const skupine = new Map<string, RijecZadatka[]>();
  for (const r of dobre) skupine.set(r.rima!, [...(skupine.get(r.rima!) ?? []), r]);
  const vecih = (n: number) => promijesaj([...skupine.entries()].filter(([, g]) => g.length >= n), rnd);
  const izvan = (rima: string, n: number) => promijesaj(dobre.filter((r) => r.rima !== rima), rnd).slice(0, n);
  const n = Math.max(1, Math.min(p.stavki, 12));

  if (v === "scena") return prazno("scena");   // scenu slaže logoped: slike ovise o pozadini
  if (v === "slogovi") return slozSlogove("duljina", rijeci, p.stavki, 4, rnd);
  if (v === "prvi_glas") {
    // Slova za koja katalog ima dovoljno slika, svako jednom; krugova koliko traži `stavki` (do 6).
    const sa = rijeci.filter((r) => r.slika);
    const izvor = sa.length >= SLIKA_MIN ? sa : rijeci;
    const slova = promijesaj(ABECEDA.filter((sl) => izvor.filter((r) => prviGlas(r.rijec) === sl).length >= 3), rnd).slice(0, Math.min(n, 6));
    return { kolo: [...ABECEDA], krugovi: (slova.length ? slova : [null]).map((sl) => slozKrug(sl, izvor, SLIKA_MIN, rnd)) };
  }
  if (v === "percepcija") {
    // Riječi sa slikom (bez slike je red riječi, što nije vizualni zadatak), svaka jednom.
    const izbor = promijesaj(rijeci.filter((r) => r.slika), rnd).slice(0, n);
    return { trazi: "razlicitu", stavke: (izbor.length ? izbor : [null]).map((r) => slozRed(r?.id ?? null, 4, "razlicitu", rnd)) };
  }
  if (v === "listic") {
    return { kartice: promijesaj(dobre, rnd).slice(0, Math.max(1, Math.min(p.stavki, 12))).map((r) => ({ rijec_id: r.id, tekst: r.rijec.toLocaleUpperCase("hr") })), raspored: "auto" };
  }
  if (v === "odabir") {
    const stavke = vecih(2).slice(0, n).map(([rima, g]) => {
      const [zadana, tocan] = promijesaj(g, rnd);
      const ponudeno = promijesaj([tocan, ...izvan(rima, PONUDENIH - 1)], rnd);
      return { zadana: zadana.id, ponudeno: ponudeno.map((r) => r.id), tocno: ponudeno.indexOf(tocan) };
    });
    return { odnos: "rima", stavke };
  }
  if (v === "povezivanje") {
    const parovi = vecih(2).slice(0, Math.min(n, 6)).map(([, g]) => { const [a, b] = promijesaj(g, rnd); return { lijevo: a.id, desno: b.id }; });
    let red = promijesaj(parovi.map((_, i) => i), rnd);
    // Desni stupac ne smije biti u istom redoslijedu kao lijevi.
    if (red.length > 1 && red.every((x, i) => x === i)) red = [...red.slice(1), red[0]];
    return { odnos: "rima", parovi, desno_redoslijed: red };
  }
  const stavke = vecih(3).slice(0, n).map(([rima, g]) => {
    const tri = promijesaj(g, rnd).slice(0, 3);
    const uljez = izvan(rima, 1)[0];
    const slike = promijesaj([...tri, uljez], rnd);
    return { slike: slike.map((r) => r.id), uljez: slike.indexOf(uljez) };
  });
  return { odnos: "rima", stavke };
}

/**
 * Krug za slovo: 3–5 slika koje počinju glasom (koliko ih katalog ima), ostalo ometači s
 * drugim prvim glasom, svaka riječ jednom, redoslijed nasumičan.
 */
export function slozKrug(slovo: string | null, rijeci: RijecZadatka[], n = SLIKA_MIN, rnd: () => number = Math.random): Krug {
  n = Math.max(SLIKA_MIN, Math.min(SLIKA_MAX, n));
  if (!slovo) return { slovo: null, slike: Array(n).fill(null), tocno: [] };
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
 */
export function slozSlogove(nacin: NacinSlogova, rijeci: RijecZadatka[], n: number, krugova = 4, rnd: () => number = Math.random): Slogovi {
  n = Math.max(2, Math.min(SLOGOVI_SLIKA_MAX, n));
  const sa = rijeci.filter((r) => r.slika);
  const izvor = sa.length >= n * 2 ? sa : rijeci;
  const skupine = new Map<number, RijecZadatka[]>();
  for (const r of promijesaj(izvor, rnd)) { const k = Math.min(r.slogova, SLOGOVA_MAX); skupine.set(k, [...(skupine.get(k) ?? []), r]); }
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
  } else {
    izbor = kruzno(Array.from({ length: krugova }, (_, i) => i + 1), n);
  }
  return { nacin, krugova, slike: promijesaj(izbor, rnd).map((r) => ({ rijec_id: r.id, slogova: r.slogova })) };
}
