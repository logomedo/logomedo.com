// Vrste zadataka (docs/zadaci.md). Vrsta je mehanika (odaberi, poveži, pronađi uljeza,
// listić), a odnos (zasad samo rima) je parametar sadržaja. Točan odgovor je spremljen u
// sadržaju; odnos služi generatoru i upozorenjima u editoru, ne ocjenjivanju.
//
// Čisti TS: koriste ga API (provjera ulaza), editor i prikaz u pregledniku te testovi.

import { rimujuSe } from "./rima.ts";

export type Vrsta = "listic" | "odabir" | "povezivanje" | "uljez";
export type Odnos = "rima";
type Id = number | null;

export interface Listic { kartice: { rijec_id: Id; tekst: string }[] }
export interface Odabir { odnos: Odnos; stavke: { zadana: Id; ponudeno: Id[]; tocno: number }[] }
/** `desno_redoslijed[k]` = indeks para čija je desna slika na k-tom mjestu desnog stupca. */
export interface Povezivanje { odnos: Odnos; parovi: { lijevo: Id; desno: Id }[]; desno_redoslijed: number[] }
export interface Uljez { odnos: Odnos; stavke: { slike: Id[]; uljez: number }[] }
export type Sadrzaj = Listic | Odabir | Povezivanje | Uljez;

/** Riječ kakvu editor i prikaz trebaju. `slika` je URL ili null (prikazuje se riječ). */
export interface RijecZadatka { id: number; rijec: string; rima: string | null; slogova: number; slika: string | null }

export const VRSTE: Record<Vrsta, { naziv: string; opis: string; uputa: string; ispis: string; odnos: boolean }> = {
  listic: {
    naziv: "Radni listić", opis: "Naslov i niz slika s tekstom ispod (riječ ili rečenica).",
    uputa: "", ispis: "Imenuj, oboji, zaokruži", odnos: false,
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
};
export const jeVrsta = (v: unknown): v is Vrsta => typeof v === "string" && v in VRSTE;

export const PONUDENIH = 3;
export const U_REDU = 4;

export function prazno(v: Vrsta, stavki = 4): Sadrzaj {
  const n = Array.from({ length: stavki });
  switch (v) {
    case "listic": return { kartice: Array.from({ length: 12 }, () => ({ rijec_id: null, tekst: "" })) };
    case "odabir": return { odnos: "rima", stavke: n.map(() => ({ zadana: null, ponudeno: [null, null, null], tocno: 0 })) };
    case "povezivanje": return { odnos: "rima", parovi: n.map(() => ({ lijevo: null, desno: null })), desno_redoslijed: n.map((_, i) => i) };
    case "uljez": return { odnos: "rima", stavke: n.map(() => ({ slike: [null, null, null, null], uljez: 0 })) };
  }
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
      return { kartice: niz(o.kartice, 60, (k) => ({ rijec_id: id(obj(k).rijec_id), tekst: String(obj(k).tekst ?? "").slice(0, 200) })) };
    case "odabir":
      return {
        odnos: "rima",
        stavke: niz(o.stavke, 12, (s) => {
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
        stavke: niz(o.stavke, 12, (s) => {
          const x = obj(s);
          return { slike: tocnoN(niz(x.slike, U_REDU, id), U_REDU, () => null), uljez: ind(x.uljez, U_REDU) };
        }),
      };
  }
}

/** Svi id-jevi riječi u sadržaju (za dohvat slika). */
export function rijeciU(v: Vrsta, s: Sadrzaj): number[] {
  const out: Id[] = [];
  if (v === "listic") out.push(...(s as Listic).kartice.map((k) => k.rijec_id));
  if (v === "odabir") for (const x of (s as Odabir).stavke) out.push(x.zadana, ...x.ponudeno);
  if (v === "povezivanje") for (const p of (s as Povezivanje).parovi) out.push(p.lijevo, p.desno);
  if (v === "uljez") for (const x of (s as Uljez).stavke) out.push(...x.slike);
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

export type Odgovor = { stavka: number; odabrano: number; ms?: number } | { lijevo: number; desno: number; ms?: number };

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

  if (v === "listic") {
    return { kartice: promijesaj(dobre, rnd).slice(0, 12).map((r) => ({ rijec_id: r.id, tekst: r.rijec.toLocaleUpperCase("hr") })) };
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
