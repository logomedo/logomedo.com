// Landing (docs/landing/sadrzaj.md, odluke 200–206): brojke, placeholderi za vrata S6 i SEO na jednom mjestu.
// Prazan placeholder uklanja cijeli element (odluka 206); nikad se ne objavljuje „[… — S6]”.

export const SITE = "https://logomedo.com";

/** Zaokružene brojke (odluka 202). S6 ih provjerava upitima na produkciji prije objave. */
export const BROJKE = {
  glasova: 30,
  rijeci: "650+",
  slika: "1300+",
  stilova: 2,
  vrstaZadataka: 11,
  znakova: 90,
  temaIgre: 2,
} as const;

/** `[DEMO — S6]`: putanja `/b/<demo-slug>`; prazno = rezerva bez demoa (odluka 205). */
export const DEMO_URL: string = "";
/** Kontakt (landing odluka 602): href („mailto:…” ili URL) za „Kontakt:” u podnožju, O-4 i /uvjeti; prazno = bez tih elemenata. */
export const KONTAKT: string = "mailto:bok@logomedo.com";
/** Ime tvrtke uz „© GODINA.” u podnožju (landing odluka 600). */
export const IME_TVRTKE: string = "ITalk d.o.o.";
/** Godina u retku s autorskim pravom u podnožju. */
export const GODINA: string = "2026";
/**
 * Godina prvog LogoMeda (O-2 na /o-nama): najstariji radni listići u izvozu starog appa su iz 2017.
 * (`../preuzimanje/docs/legacy-data-stats.txt`, landing odluka 601). Prazno = naslov „Stari i novi LogoMedo”.
 */
export const GODINA_PRVOG: string = "2017";
/**
 * Pružatelj usluge i voditelj obrade (javni podaci iz sudskog registra; landing odluka 600). Na /privatnost (voditelj
 * obrade) i /uvjeti (pružatelj, Zakon o elektroničkoj trgovini čl. 6). Bez osobnih e-mailova i telefona.
 */
export const TVRTKA = {
  naziv: "ITalk d.o.o. za informacijske tehnologije",
  kratko: "ITalk d.o.o.",
  oib: "54872935051",
  mbs: "081042440",
  sud: "Trgovački sud u Zagrebu",
  adresa: "IX. Južna obala 20, 10000 Zagreb, Hrvatska",
  /** Pitanja o osobnim podacima i zahtjevi iz GDPR-a (isti kao KONTAKT, odluka korisnika 19. 11. 2026.). */
  privatnost: "bok@logomedo.com",
} as const;
/** Ime voditelja obrade za P-5 (landing odluke 503, 600). */
export const VODITELJ_OBRADE = TVRTKA.naziv;
/** `[DATUM OBJAVE — S6]` (P-1 na /privatnost, /uvjeti): datum od kojeg tekst vrijedi; prazno = bez retka „Stanje na dan”. */
export const DATUM_OBJAVE: string = "19. 11. 2026.";

export const PRIJAVA = "/admin/login";
/** Obrazac „Zatraži pristup” za privatnu betu (S7): svi gumbi i linkovi „Zatraži pristup” vode ovamo. */
export const PRISTUP = "/pristup";

/** Tekst za „Kontakt:” iz hrefa (mailto: bez prefiksa). */
export const kontaktTekst = (href: string) => href.replace(/^mailto:/, "");

export interface Stranica {
  putanja: string;
  naslov: string;
  opis: string;
  /** Tekst linka u zaglavlju/podnožju. */
  izbornik?: string;
  /** SSR umjesto prerendera (obrađuje POST; zaglavlja iz middlewarea, ne iz public/_headers). */
  ssr?: true;
}

/** SEO po stranici (sadrzaj.md 2.1). Redoslijed = sitemap. Title ≤ 60, description ≤ 155 (test). */
export const STRANICE: Stranica[] = [
  {
    putanja: "/",
    naslov: "LogoMedo · slike i radni listići za logopede",
    opis: "Katalog slika po glasovima i pozicijama, radni listići za ispis i igre za dijete na tabletu. LogoMedo je alat za logopede.",
  },
  {
    putanja: "/katalog",
    naslov: "Katalog slika po glasovima · LogoMedo",
    opis: "30 glasova, 650+ riječi i 1300+ slika u dva stila: ilustracija i bojanka. Riječi složene po početku, sredini i kraju.",
    izbornik: "Katalog",
  },
  {
    putanja: "/radni-listici",
    naslov: "Radni listići i PDF za ispis · LogoMedo",
    opis: "Radni listić po glasovima u jednom kliku i još deset vrsta zadataka. Gotov PDF za A4, s ukrasnim okvirom ili bez.",
    izbornik: "Radni listići",
  },
  {
    putanja: "/igre",
    naslov: "Igre za dijete na tabletu · LogoMedo",
    opis: "Zadatke iz bilježnice dijete rješava na tabletu ili mobitelu preko linka, bez prijave. O djetetu se ništa ne sprema.",
    izbornik: "Igre",
  },
  {
    putanja: "/o-nama",
    naslov: "O nama · LogoMedo",
    opis: "Novi LogoMedo nastaje zajedno s logopedima. Tko ga radi, odakle dolazi i kako se uključiti u probno razdoblje.",
    izbornik: "O nama",
  },
  {
    putanja: "/pristup",
    naslov: "Zatraži pristup · LogoMedo",
    opis: "LogoMedo je u privatnoj beti za logopede. Pošaljite zahtjev s imenom, e-mailom i ustanovom, a pozivnicu za prijavu šaljemo osobno.",
    izbornik: "Zatraži pristup",
    ssr: true,
  },
  {
    putanja: "/privatnost",
    naslov: "Privatnost · LogoMedo",
    opis: "Stranice LogoMeda ne koriste kolačiće ni praćenje. Što se sprema za logopede i zašto se o djetetu ne sprema ništa.",
    izbornik: "Privatnost",
  },
  {
    putanja: "/uvjeti",
    naslov: "Uvjeti korištenja · LogoMedo",
    opis: "Tko pruža LogoMedo, tko ga smije koristiti, čije su slike i zadaci i što vrijedi dok je aplikacija u probnom razdoblju.",
    izbornik: "Uvjeti korištenja",
  },
];

export const STRANICA_404 = { naslov: "Stranica nije pronađena · LogoMedo" } as const;

export const stranica = (putanja: string): Stranica => {
  const s = STRANICE.find((x) => x.putanja === putanja);
  if (!s) throw new Error(`landing: nema SEO podataka za ${putanja}`);
  return s;
};

/** Kanonski URL bez kose crte na kraju (osim naslovne); build.format "file". */
export const kanonski = (putanja: string) => `${SITE}${putanja}`;

/** Zaglavlje (odluka 201): četiri linka; Privatnost samo u podnožju. */
export const IZBORNIK = ["/katalog", "/radni-listici", "/igre", "/o-nama"].map((p) => ({ href: p, tekst: stranica(p).izbornik! }));

export const OG = {
  slika: `${SITE}/landing/og.png`,
  sirina: 1200,
  visina: 630,
  alt: "LogoMedo: slike za svaki glas, listić za tren.",
} as const;

/**
 * V-1 (sadrzaj.md odjeljak 4): četiri ilustracije iz kataloga, public/landing/<ime>-{256,512}.webp.
 * `ostale`: u heru se na prelazak mišem (dodir na mobitelu) i polako sama od sebe izmjenjuju slike istog
 * slova (odluka 802); `ime` je prva, ona se vidi bez JS-a i u N-4 i OG slici.
 */
export const ILUSTRACIJE_V1 = [
  { ime: "rukavice", glas: "R", ostale: ["riba", "raketa", "robot"] },
  { ime: "sunce", glas: "S", ostale: ["sova", "sladoled", "snjegovic"] },
  { ime: "zirafa", glas: "Ž", ostale: ["zarulja", "zir"] },
  { ime: "lav", glas: "L", ostale: ["lisica", "leptir", "lubenica"] },
] as const;
export const ALT_V1 = "Ilustracije iz kataloga: rukavice, sunce, žirafa i lav.";

/**
 * N-4 (odluka 805): slika uz svako slovo, public/landing/<ime>-256.webp. R, S, Ž, L su iz V-1 i vide se odmah;
 * ostale se pokažu kad posjetitelj klikne slovo (public/landing/glasovi.js).
 */
export const SLIKE_GLASOVA: Record<string, string> = {
  ...Object.fromEntries(ILUSTRACIJE_V1.map((s) => [s.glas, s.ime])),
  "C": "cvijet",
  "Z": "zebra",
  "Č": "cokolada",
  "Š": "sesir",
  "K": "kornjaca",
  "Đ": "dumbirko",
  "DŽ": "dzip",
  "G": "gitara",
  "M": "macka",
  "B": "balon",
  "P": "pas",
  "V": "vlak",
  "F": "foka",
  "T": "traktor",
  "D": "delfin",
  "N": "naranca",
  "J": "jabuka",
  "LJ": "ljuljacka",
  "NJ": "njuska",
  "Ć": "cuk",
  "H": "helikopter",
  "A": "ananas",
  "E": "eskim",
  "I": "iglu",
  "O": "ovca",
  "U": "uho",
};

/** Redoslijed glasova iz kataloga (N-4): 25 suglasnika, pa 5 samoglasnika. */
export const SUGLASNICI = ["C", "S", "Z", "Č", "Š", "Ž", "L", "R", "K", "Đ", "DŽ", "G", "M", "B", "P", "V", "F", "T", "D", "N", "J", "LJ", "NJ", "Ć", "H"];
export const SAMOGLASNICI = ["A", "E", "I", "O", "U"];

/** sitemap.xml iz STRANICE (404 nije u sitemapu). */
export function sitemapXml(): string {
  const url = STRANICE.map((s) => `  <url><loc>${kanonski(s.putanja)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${url}\n</urlset>\n`;
}

/**
 * Snimke zaslona (sadrzaj.md odjeljak 4, odluka 209): public/landing/v<N>-desktop.webp (1280×800), uz `mobitel`
 * još v<N>-mobitel.webp (390×844 @2x), uz `tamna` još -tamna varijante obje veličine. `samoMobitel`: postoji samo
 * v<N>-mobitel.webp (V-21), prikazuje se uvijek uska, kao mobitel. Alt doslovno iz tablice.
 */
export interface Snimka { alt: string; mobitel?: boolean; tamna?: boolean; samoMobitel?: boolean }
export const SNIMKE = {
  2: { alt: "Katalog u LogoMedu: mape glasova s brojem riječi u svakoj.", mobitel: true },
  3: { alt: "Radni listić za glas R na početku riječi, spreman za ispis na A4.", mobitel: true },
  4: { alt: "Igra za dijete na tabletu: zadatak sa slikama i bor s lampicama." },
  6: { alt: `Katalog s ${BROJKE.glasova} mapa glasova, u stilu ilustracije.`, mobitel: true, tamna: true },
  7: { alt: "Riječi s glasom R razvrstane po poziciji: početak, sredina, kraj i skupine.", mobitel: true },
  10: { alt: "Pregled nove slike s gumbima Odobri i Odbij." },
  11: { alt: "Slova, brojke i simboli u fontu za početno čitanje.", mobitel: true },
  12: { alt: "Ilustracija scene Pečemo kolačiće sa slikama ispod." },
  13: { alt: "Odabir glasa, pozicije i isključenih glasova za novi radni listić.", mobitel: true },
  14: { alt: "Radni listić na stranici A4 s ukrasnim okvirom i praznom crtom za ime.", mobitel: true },
  15: { alt: "Jedanaest vrsta zadataka u predlošcima.", mobitel: true, tamna: true },
  16: { alt: "Kolo sa slovima stalo je na glasu; zatim dijete među slikama traži one koje počinju tim glasom." },
  17: { alt: "Zadatak prebrajanja: ispod svake slike kružići za slogove." },
  18: { alt: "Izbor okvira: rubovi, mašne i ukrasi za kutove." },
  20: { alt: "Igra u temi Božić: zadatak na tabletu i bor s lampicama." },
  21: { alt: "Igra u temi Proljeće na mobitelu: stablo jabuke i zadatak sa slikama.", samoMobitel: true },
  22: { alt: "Završni ekran igre s porukom Bravo i gumbom Ponovi.", mobitel: true },
  23: { alt: "Naslovnica bilježnice s borom čije lampice dijete boji." },
  24: { alt: "Bilježnica sa zadacima složenima po redu." },
} as const satisfies Record<number, Snimka>;
export type SnimkaId = keyof typeof SNIMKE;
export const SNIMKA_DESKTOP = { sirina: 1280, visina: 800 } as const;
export const SNIMKA_MOBITEL = { sirina: 780, visina: 1688 } as const;

/** Putanje datoteka jedne snimke (za <picture> i test postojanja). */
export function snimkaDatoteke(v: SnimkaId) {
  const s: Snimka = SNIMKE[v];
  const put = (vel: "desktop" | "mobitel", tamna: boolean) => `/landing/v${v}-${vel}${tamna ? "-tamna" : ""}.webp`;
  const varijante = s.tamna ? [false, true] : [false];
  return varijante.map((tamna) => ({
    tamna,
    desktop: s.samoMobitel ? undefined : put("desktop", tamna),
    mobitel: s.mobitel || s.samoMobitel ? put("mobitel", tamna) : undefined,
  }));
}

/** V-8, V-9 (K-3): ilustracija + bojanka, public/landing/<ime>-512.webp i <ime>-bojanka-512.webp. */
/** V-25 (O-1): ilustracija sove 512 px, public/landing/sova-512.webp. */
export const ILUSTRACIJA_V25 = { src: "/landing/sova-512.webp", alt: "Ilustracija sove iz kataloga." } as const;

export const PAROVI_STILOVA = [
  { ime: "rukavice", alt: "Rukavice u dva stila: ilustracija u boji i crno-bijela bojanka." },
  { ime: "sunce", alt: "Sunce u dva stila: ilustracija u boji i bojanka." },
] as const;
