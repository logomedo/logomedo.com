// Bočna traka admina po području (docs/uprava/plan.md): Sadržaj (izrada materijala, za sve uloge) i Uprava
// (korisnici, novac, poruke; samo superadmin, sve pod /admin/uprava). Čisti TS: AdminOkvir crta, testovi provjeravaju.
// Brojače (kandidati, zahtjevi, poruke…) računa AdminOkvir; ovdje je samo ključ brojača.

export type Podrucje = "sadrzaj" | "uprava";

export type Brojac = "kandidata" | "zvukova" | "red" | "zahtjeva" | "poruka" | "uprava";

export type Stavka = {
  kod: string;
  href: string;
  tekst: string;
  ikona: string;
  brojac?: Brojac;
};

export type Skupina = { naslov: string; boja: string; stavke: Stavka[] };

export type Traka = {
  /** Skupine s naslovom i bojom (gore). */
  skupine: Skupina[];
  /** Alati bez okvira skupine (ispod skupina). */
  alati: Stavka[];
  /** Dno trake: prijelaz u drugo područje i postavke. */
  dno: Stavka[];
};

const postavke: Stavka = { kod: "postavke", href: "/admin/postavke", tekst: "Postavke", ikona: "postavke" };

export const TRAKE = {
  sadrzaj: {
    skupine: [
      { naslov: "Odobravanje", boja: "var(--med)", stavke: [
        { kod: "pregled", href: "/admin/pregled", tekst: "Slike", ikona: "pregled", brojac: "kandidata" },
        { kod: "zvukovi", href: "/admin/zvukovi", tekst: "Izgovor", ikona: "zvuk", brojac: "zvukova" },
      ] },
      { naslov: "Sadržaj", boja: "var(--info)", stavke: [
        { kod: "katalog", href: "/admin", tekst: "Katalog", ikona: "katalog" },
      ] },
      { naslov: "Vježbe", boja: "var(--uspjeh)", stavke: [
        { kod: "predlosci", href: "/admin/predlosci", tekst: "Novi zadatak", ikona: "predlosci" },
        { kod: "zadaci", href: "/admin/zadaci", tekst: "Zadaci", ikona: "zadaci" },
        { kod: "biljeznice", href: "/admin/biljeznice", tekst: "Bilježnice", ikona: "biljeznica" },
      ] },
    ],
    alati: [
      { kod: "red", href: "/admin/red", tekst: "Red generiranja", ikona: "red", brojac: "red" },
      { kod: "prompt", href: "/admin/prompt", tekst: "Prompt", ikona: "iskra" },
      { kod: "aktivnost", href: "/admin/aktivnost", tekst: "Aktivnost", ikona: "sat" },
    ],
    dno: [
      { kod: "uprava", href: "/admin/uprava", tekst: "Uprava", ikona: "uprava", brojac: "uprava" },
      postavke,
    ],
  },
  uprava: {
    skupine: [
      { naslov: "Korisnici", boja: "var(--info)", stavke: [
        { kod: "korisnici", href: "/admin/uprava/korisnici", tekst: "Korisnici i pozivnice", ikona: "korisnici" },
        { kod: "zahtjevi", href: "/admin/uprava/zahtjevi", tekst: "Zahtjevi", ikona: "pismo", brojac: "zahtjeva" },
      ] },
      { naslov: "Prodaja", boja: "var(--med)", stavke: [
        { kod: "uplate", href: "/admin/uprava/uplate", tekst: "Uplate i računi", ikona: "novac" },
        { kod: "pogodnosti", href: "/admin/uprava/pogodnosti", tekst: "Pogodnosti", ikona: "iskra" },
        { kod: "kuponi", href: "/admin/uprava/kuponi", tekst: "Kuponi", ikona: "kupon" },
      ] },
      { naslov: "Komunikacija", boja: "var(--uspjeh)", stavke: [
        { kod: "poruke", href: "/admin/uprava/poruke", tekst: "Poruke", ikona: "poruke", brojac: "poruka" },
      ] },
    ],
    alati: [],
    dno: [
      { kod: "sadrzaj", href: "/admin", tekst: "Natrag na sadržaj", ikona: "natrag" },
      postavke,
    ],
  },
} as const satisfies Record<Podrucje, Traka>;

type SveStavke<T> = T extends { skupine: readonly { stavke: readonly (infer A)[] }[]; alati: readonly (infer B)[]; dno: readonly (infer C)[] } ? A | B | C : never;

/** Kod aktivne stavke (prop `aktivno` u AdminOkviru). „pregled-uprave” je /admin/uprava. */
export type Aktivno = SveStavke<(typeof TRAKE)[Podrucje]>["kod"] | "pregled-uprave";

/** Sve stavke jedne trake, redom kako se crtaju. */
export const stavkeTrake = (t: Traka): Stavka[] => [...t.skupine.flatMap((g) => g.stavke), ...t.alati, ...t.dno];
