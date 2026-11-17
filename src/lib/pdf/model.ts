// Model dokumenta za ispis: iste stranice crta PDF (ispis-pdf.ts) i HTML pregled Ispisa zadatka (klijent.ts).
// Samostalan zadatak se lomi po stvarnoj visini stranice (straniceZadatka s prostorom); bilježnica po
// fiksnom broju (odabir 3 reda, uljez i percepcija 4, slogovi 3 reda, povezivanje 1 stranica, listić 12 kartica).

import { jeNapisano, mapaRijeci } from "../zadaci/napisano.ts";
import type { Tema } from "../teme.ts";
import { imaOkvir, podrucje, slojevi, type Okvir, type Podrucje } from "../okviri.ts";
import { TEME } from "../teme.ts";
import { rasporedListica, poStraniciListica, VRSTE, zadanaUputa, BOJE_DULJINE, type RasporedListica, type Slogovi, type Izmjena, type Listic, type Odabir, type Percepcija, type PrviGlas, type Povezivanje, type Sadrzaj, type Scena, type Uljez, type Vrsta } from "../zadaci/vrste.ts";

/** Slika na papiru: URL (ili null, tada se u okviru ispiše riječ) i natpis ispod (ili ""). */
/** `znak`: slovo ili brojka iz kataloga znakova, crta se kao znak u okviru (s izmjenom), ne kao riječ. */
/** `napisano`: riječ napisana umjesto slike (zadaci/napisano.ts), Andikom preko okvira; ima i `znak` jer treba isti font. */
export interface SlikaPdf { url: string | null; rijec: string; natpis: string; izmjena?: Izmjena; znak?: boolean; napisano?: boolean }

/** Siva slika je zasebna datoteka: preglednik je pri smanjivanju pretvori u sivu (preglednik.ts). */
export const SIVA = "#siva";

export type TijeloPdf =
  | { vrsta: "odabir"; redovi: { zadana: SlikaPdf; ponudeno: SlikaPdf[] }[] }
  | { vrsta: "uljez"; redovi: SlikaPdf[][] }
  | { vrsta: "percepcija"; redovi: SlikaPdf[][] }
  | { vrsta: "prvi_glas"; slovo: string; slike: SlikaPdf[] }
  /** `legenda` (duljina): boje bojica; `krugova` (analiza): prazni krugovi ispod svake slike. */
  | { vrsta: "slogovi"; legenda?: { naziv: string; boja: string; duga: boolean }[]; krugova: number; slike: SlikaPdf[] }
  | { vrsta: "povezivanje"; lijevo: SlikaPdf[]; desno: SlikaPdf[] }
  | { vrsta: "listic"; kartice: { slika: SlikaPdf | null; tekst: string }[]; raspored?: RasporedListica }
  | { vrsta: "scena"; pozadina: string | null; gumbi: SlikaPdf[] };

export interface StranicaPdf {
  /** Veliki naslov na vrhu (samo prva stranica samostalnog zadatka). */
  naslov?: string;
  /** Uputa djetetu iznad zadatka. */
  uputa?: string;
  /** Crta „Ime: ____" ispod naslova. */
  ime?: boolean;
  tijelo: TijeloPdf;
  /** Indeksi izvornih stavki zadatka na ovoj stranici (odabir/uljez/percepcija: stavke, slogovi: slike, prvi glas: krugovi, povezivanje: parovi, listić: kartice). */
  indeksi?: number[];
  /** Procjena veličine slike (mm, `najmanjaSlika`): HTML pregled tako crta slike koje PDF smanjuje (povezivanje, slogovi, prvi glas). */
  velicina?: number;
}

export interface DokumentPdf {
  naslov: string;
  /** Tekst u podnožju svake stranice. */
  podnozje: string;
  /** Grančice jele u kutovima (bilježnica). */
  ukrasi?: boolean;
  /** Okvir samostalnog zadatka (rub, mašna, ukrasi u kutovima); samo kad ne smanjuje slike (`okvirDopusten`). */
  okvir?: Okvir;
  /** Naslovnica bilježnice s borom za bojanje. */
  naslovnica?: { naslov: string; uputa: string; lampica: number; tema?: Tema };
  stranice: StranicaPdf[];
}

export interface RijecPdf { id: number; rijec: string; slika: string | null; znak?: boolean }
/** Pozadina scene za papir: A4 je uspravan, pa uspravna slika ima prednost. */
export interface PozadinaPdf { id: number; uspravno: { url: string } | null; vodoravno: { url: string } | null }
const urlPozadine = (pozadine: PozadinaPdf[], id: number | null) => {
  const p = pozadine.find((x) => x.id === id);
  return p ? (p.uspravno ?? p.vodoravno)?.url ?? null : null;
};

const komadi = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
export const VELIKO = (s: string) => s.toLocaleUpperCase("hr");

/**
 * Prostor za tijelo zadatka na papiru (mm): širina i visina `i`-te stranice. Kad ga nema (bilježnica),
 * stranice se lome po fiksnom broju redova (odabir 3, uljez i percepcija 4, slogovi 3 reda).
 */
export interface ProstorStranica { W: number; H: (i: number) => number }

/** Stranica tijela s indeksima izvornih stavki na njoj (pregled Ispisa crta iste stavke kao PDF). */
export interface TijeloSIndeksima { tijelo: TijeloPdf; indeksi: number[] }

/**
 * Pohlepno punjenje stranica: na stranicu ide redova koliko stane (`stane`), barem jedan.
 * `korak` = stavki u redu (slogovi: 3 ili 4 slike), pa se lomi samo između redova.
 */
function punjenje<T>(a: T[], korak: number, stane: (k: T[], stranica: number) => boolean): T[][] {
  const out: T[][] = [];
  let i = 0;
  while (i < a.length) {
    let n = Math.min(korak, a.length - i);
    while (i + n < a.length && stane(a.slice(i, Math.min(a.length, i + n + korak)), out.length)) n = Math.min(a.length - i, n + korak);
    out.push(a.slice(i, i + n));
    i += n;
  }
  return out;
}

/** Stranice (bez zaglavlja) jednog zadatka; s `prostor` na stranicu stane koliko stvarno stane. */
export function tijelaZadatka(vrsta: Vrsta, s: Sadrzaj, rijeci: Map<number, RijecPdf>, sRijecima = true, pozadine: PozadinaPdf[] = [], prostor?: ProstorStranica): TijeloPdf[] {
  return straniceZadatka(vrsta, s, rijeci, sRijecima, pozadine, prostor).map((x) => x.tijelo);
}

export function straniceZadatka(vrsta: Vrsta, s: Sadrzaj, rijeci: Map<number, RijecPdf>, sRijecima = true, pozadine: PozadinaPdf[] = [], prostor?: ProstorStranica): TijeloSIndeksima[] {
  const sl = (id: number | null): SlikaPdf => {
    const r = id === null ? undefined : rijeci.get(id);
    if (!r) return { url: null, rijec: "?", natpis: "" };
    if (jeNapisano(id)) return { url: null, rijec: VELIKO(r.rijec), natpis: "", znak: true, napisano: true };
    if (r.znak) return { url: null, rijec: r.rijec, natpis: "", znak: true };
    // Bez slike je riječ već u okviru, pa natpis ne treba.
    return { url: r.slika, rijec: VELIKO(r.rijec), natpis: sRijecima && r.slika ? VELIKO(r.rijec) : "" };
  };
  /** Stavke s indeksima → stranice: fiksno po `n` bez prostora, inače dok `najmanjaSlika` ne padne ispod `prag`. */
  const lomi = <T>(stavke: T[], n: number, u: (k: T[]) => TijeloPdf, korak = 1, prag?: (k: T[]) => number): TijeloSIndeksima[] => {
    const sIndeksom = stavke.map((x, i) => ({ x, i }));
    const dijelovi = !prostor ? komadi(sIndeksom, n)
      : punjenje(sIndeksom, korak, (k, str) => najmanjaSlika(u(k.map((y) => y.x)), prostor.W, prostor.H(str)) >= (prag ? prag(k.map((y) => y.x)) : 0.01));
    return dijelovi.map((k) => ({ tijelo: u(k.map((y) => y.x)), indeksi: k.map((y) => y.i) }));
  };
  if (vrsta === "odabir")
    return lomi((s as Odabir).stavke, 3, (k) => ({ vrsta: "odabir", redovi: k.map((x) => ({ zadana: sl(x.zadana), ponudeno: x.ponudeno.map(sl) })) }));
  if (vrsta === "uljez")
    return lomi((s as Uljez).stavke, 4, (k) => ({ vrsta: "uljez", redovi: k.map((x) => x.slike.map(sl)) }));
  if (vrsta === "percepcija")
    return lomi((s as Percepcija).stavke, 4, (k) => ({
      vrsta: "percepcija",
      redovi: k.map((x) => x.polja.map((p) => {
        const o = sl(p.rijec_id);
        // Natpis bi odao različitu riječ; siva slika ima svoj URL.
        return { ...o, natpis: "", izmjena: p.izmjena, url: o.url && p.izmjena === "siva" ? o.url + SIVA : o.url };
      })),
    }));
  if (vrsta === "prvi_glas")
    // Krug po stranici: slovo u krugu i do 15 slika. Natpis bi odao prvi glas.
    return (s as PrviGlas).krugovi.flatMap((k, i) => (k.slovo ? [{
      tijelo: { vrsta: "prvi_glas", slovo: k.slovo, slike: k.slike.filter((id) => id !== null).map((id) => ({ ...sl(id), natpis: "" })) } as TijeloPdf,
      indeksi: [i],
    }] : []));
  if (vrsta === "slogovi") {
    // Duljina 4 slike u redu, analiza 3 (krugovi trebaju mjesta). Bez prostora 3 reda po stranici;
    // s prostorom redova koliko stane dok se slike ne bi smanjile ispod pune veličine.
    const sg = s as Slogovi;
    const po = sg.nacin === "duljina" ? 4 : 3;
    const legenda = sg.nacin === "duljina" ? (["duga", "kratka"] as const).map((k) => ({ naziv: VELIKO(BOJE_DULJINE[k].naziv), boja: BOJE_DULJINE[k].boja, duga: k === "duga" })) : undefined;
    const u = (k: { rijec_id: number | null }[]): TijeloPdf => ({ vrsta: "slogovi", legenda, krugova: sg.nacin !== "duljina" ? sg.krugova : 0, slike: k.map((x) => sl(x.rijec_id)) });
    const pune = sg.slike.map((x, i) => ({ x, i })).filter((y) => y.x.rijec_id !== null);
    const puna = (k: { x: { rijec_id: number | null } }[]) => prostor ? najmanjaSlika(u(k.slice(0, po).map((y) => y.x)), prostor.W, 1e4) - 0.05 : 0;
    return lomi(pune, po * 3, (k) => u(k.map((y) => y.x)), po, puna).map((d) => ({ tijelo: d.tijelo, indeksi: d.indeksi.map((j) => pune[j].i) }));
  }
  if (vrsta === "povezivanje") {
    // Svaka stranica je zaseban zadatak (lijevo i desno isti parovi). Bez prostora jedna stranica; inače
    // najmanje stranica s jednakim brojem parova u kojima slika ne pada ispod NAJMANJA_SLIKA.
    const p = s as Povezivanje;
    const n = p.parovi.length;
    const uStranicu = (ind: number[]): TijeloSIndeksima => ({
      tijelo: { vrsta: "povezivanje", lijevo: ind.map((i) => sl(p.parovi[i].lijevo)), desno: p.desno_redoslijed.filter((i) => ind.includes(i)).map((i) => sl(p.parovi[i].desno)) },
      indeksi: ind,
    });
    const svi = Array.from({ length: n }, (_, i) => i);
    if (!prostor || n <= 1) return [uStranicu(svi)];
    for (let str = 1; str < n; str++) {
      const po = Math.ceil(n / str);
      const dijelovi = komadi(svi, po);
      if (dijelovi.every((d, j) => najmanjaSlika(uStranicu(d).tijelo, prostor.W, prostor.H(j)) >= NAJMANJA_SLIKA)) return dijelovi.map(uStranicu);
    }
    return komadi(svi, 1).map(uStranicu);
  }
  if (vrsta === "scena") {
    const sc = s as Scena;
    return [{ tijelo: { vrsta: "scena", pozadina: urlPozadine(pozadine, sc.pozadina_id), gumbi: sc.gumbi.filter((g) => g.rijec_id !== null).map((g) => sl(g.rijec_id)) }, indeksi: [] }];
  }
  const l = s as Listic;
  const kartice = l.kartice.map((k, i) => ({ k, i })).filter(({ k }) => k.rijec_id || k.tekst);
  return komadi(kartice, poStraniciListica(l.raspored)).map((d) => ({
    tijelo: { vrsta: "listic", kartice: d.map(({ k }) => ({ slika: k.rijec_id ? { ...sl(k.rijec_id), natpis: "" } : null, tekst: k.tekst })), raspored: l.raspored },
    indeksi: d.map((x) => x.i),
  }));
}

/**
 * Samostalan zadatak (admin): naslov, uputa i ime na prvoj stranici. Na stranicu stane koliko stvarno
 * stane u prostor (A4 bez rubova, okvira i zaglavlja), pa HTML pregled i PDF lome na istom mjestu.
 */
export function dokumentZadatka(z: { vrsta: Vrsta; naslov: string; uputa: string; sadrzaj: Sadrzaj; okvir?: Okvir | null }, rijeci: RijecPdf[], sRijecima: boolean, pozadine: PozadinaPdf[] = []): DokumentPdf {
  // Okvir koji bi smanjio slike ne ide na papir, čak i ako je spremljen.
  if (imaOkvir(z.okvir) && ocjenaOkvira(z, rijeci, sRijecima, pozadine, z.okvir).dopusten)
    return { ...slozi(z, rijeci, sRijecima, pozadine, z.okvir), okvir: z.okvir };
  return slozi(z, rijeci, sRijecima, pozadine, null);
}

/** Zadatak složen za prostor okvira `okvir` (null = bez okvira); okvir se ne postavlja. */
function slozi(z: { vrsta: Vrsta; naslov: string; uputa: string; sadrzaj: Sadrzaj }, rijeci: RijecPdf[], sRijecima: boolean, pozadine: PozadinaPdf[], okvir: Okvir | null): DokumentPdf {
  const naslov = z.naslov || VRSTE[z.vrsta].naziv;
  const prva: StranicaPdf = { naslov, uputa: z.uputa || undefined, ime: true, tijelo: { vrsta: "listic", kartice: [] } };
  const o = podrucje(okvir);
  const prostor: ProstorStranica = { W: o.D - o.L, H: (i) => o.dno - o.vrh - visinaZaglavlja(i === 0 ? prva : { tijelo: prva.tijelo }, o) };
  const str = straniceZadatka(z.vrsta, z.sadrzaj, mapaRijeci(rijeci), sRijecima, pozadine, prostor);
  return {
    naslov, podnozje: "logomedo.com",
    stranice: (str.length ? str : [{ tijelo: prva.tijelo, indeksi: [] }])
      .map((x, i) => {
        const velicina = najmanjaSlika(x.tijelo, prostor.W, prostor.H(i));
        return i === 0 ? { ...prva, tijelo: x.tijelo, indeksi: x.indeksi, velicina } : { tijelo: x.tijelo, indeksi: x.indeksi, velicina };
      }),
  };
}

/** Ocjena okvira za zadatak: složen za prostor tog okvira (i bez njega, za usporedbu veličine slika). */
export function ocjenaOkvira(z: { vrsta: Vrsta; naslov: string; uputa: string; sadrzaj: Sadrzaj }, rijeci: RijecPdf[], sRijecima: boolean, pozadine: PozadinaPdf[], okvir: Okvir) {
  const bez = okvirDopusten(slozi(z, rijeci, sRijecima, pozadine, null), okvir).bez;
  const r = okvirDopusten(slozi(z, rijeci, sRijecima, pozadine, okvir), okvir);
  return { dopusten: r.s > 0 && r.s >= Math.min(NAJMANJA_SLIKA, bez) - 0.05, bez, s: r.s };
}

// ---- Okvir i kvaliteta ispisa ----

/** Slika manja od ovoga (mm) je na papiru premala za dijete; okvir je ne smije dodatno smanjiti. */
export const NAJMANJA_SLIKA = 30;

/** Najmanji razmak između redova fiksne visine (odabir, uljez, percepcija), mm; PDF ih raspoređuje `raspodijeli`. */
export const RAZMAK_REDOVA = 6;

/**
 * Procjena najmanje slike na stranici (mm) u prostoru W × H, po istim formulama kao ispis-pdf.ts
 * (tijelo). 0 = zadatak ne stane (fiksne mjere: uparivanje, uljez). Zaglavlje se procjenjuje (`zaglavlje`).
 */
export function najmanjaSlika(t: TijeloPdf, W: number, H: number): number {
  const nat = (sl: (SlikaPdf | null)[]) => (sl.some((x) => x?.natpis) ? 7 : 0);
  if (t.vrsta === "odabir") {
    const n = nat(t.redovi.flatMap((r) => [r.zadana, ...r.ponudeno]));
    return W < 168 || t.redovi.length * (38 + n + RAZMAK_REDOVA) > H ? 0 : 30;
  }
  if (t.vrsta === "uljez") return W < 4 * 37 || t.redovi.length * (37 + nat(t.redovi.flat()) + RAZMAK_REDOVA) > H ? 0 : 37;
  if (t.vrsta === "percepcija") {
    if (t.redovi.length * (37 + RAZMAK_REDOVA) > H) return 0;
    return Math.min(37, ...t.redovi.map((r) => (W - (r.length - 1) * 5) / Math.max(1, r.length)));
  }
  if (t.vrsta === "prvi_glas") {
    const st = t.slike.length > 12 ? 5 : 4, red = Math.max(1, Math.ceil(t.slike.length / st));
    return Math.min((W - (st - 1) * 6) / st, (H - 40 - (red - 1) * 6) / red, 38);
  }
  if (t.vrsta === "povezivanje") {
    const n = Math.max(t.lijevo.length, t.desno.length, 1);
    return Math.min(40, (H - 6 * (n - 1)) / n - nat([...t.lijevo, ...t.desno]));
  }
  if (t.vrsta === "scena") {
    const po = Math.min(5, Math.max(1, t.gumbi.length));
    return Math.min(32, (W - (po - 1) * 5) / po);
  }
  if (t.vrsta === "slogovi") {
    const st = t.krugova ? 3 : 4, red = Math.max(1, Math.ceil(t.slike.length / st));
    const redKrugova = t.krugova * 10.5 - 2.5 <= 46 ? 1 : 2, kr = t.krugova ? (redKrugova === 1 ? 12 : 21) : 0, g = t.krugova ? 9 : 6;
    return Math.min((W - (st - 1) * g) / st, (H - (t.legenda ? 14 : 0) - (red - 1) * g) / red - nat(t.slike) - kr, t.krugova ? 46 : 44);
  }
  const g = 7, tekst = t.kartice.some((k) => k.tekst) ? 9 : 0;
  const r = rasporedListica(t.kartice.length, t.raspored, W, H, g, tekst);
  return Math.min(r.s, (W - (r.stupaca - 1) * g) / r.stupaca);
}

/**
 * Visina zaglavlja (naslov, uputa, ime) u mm, kao u ispis-pdf.ts (redak = 1,25 × pt, +1 iza naslova i
 * upute, ime 10, razmak 8). Broj redaka se procjenjuje sa strane sigurnosti (Nunito: naslov ~0,6 em,
 * tekst ~0,55 em po znaku, 85 % širine zbog prijeloma po riječima); test ga uspoređuje sa stvarnim fontom.
 */
export function visinaZaglavlja(s: Pick<StranicaPdf, "naslov" | "uputa" | "ime">, o: Podrucje = podrucje(null)): number {
  const sirina = o.sredina ? 140 : o.D - o.L;
  const redaka = (t: string, pt: number, em: number) => Math.max(1, Math.ceil((t.length * pt * em * 25.4 / 72) / (sirina * 0.85)));
  const visina = (t: string, pt: number, em: number) => (redaka(t, pt, em) * pt * 1.25 * 25.4) / 72 + 1;
  return (s.naslov ? visina(s.naslov, 22, 0.6) : 0) + (s.uputa ? visina(s.uputa, 13, 0.55) : 0) + (s.ime ? 10 : 0) + 8;
}

/**
 * Smije li zadatak imati okvir: na svakoj stranici sve stane, a najmanja slika ostaje barem
 * `NAJMANJA_SLIKA` mm, ili, ako je već bez okvira manja, okvir je ne smanjuje.
 */
export function okvirDopusten(dok: DokumentPdf, okvir: Okvir): { dopusten: boolean; bez: number; s: number } {
  const mjera = (o: Okvir | null) => {
    const p = podrucje(o);
    return Math.min(...dok.stranice.map((s) => najmanjaSlika(s.tijelo, p.D - p.L, p.dno - p.vrh - visinaZaglavlja(s, p))));
  };
  const bez = mjera(null), s = mjera(okvir);
  return { dopusten: s > 0 && s >= Math.min(NAJMANJA_SLIKA, bez) - 0.05, bez, s };
}

/** Bilježnica: naslovnica s borom, pa zadaci; svaka stranica nosi uputu svoje vrste. */
export function dokumentBiljeznice(
  b: { naslov: string; tema?: Tema },
  zadaci: { vrsta: Vrsta; sadrzaj: Sadrzaj; uputa?: string | null }[],
  rijeci: RijecPdf[],
  lampica: number,
  pozadine: PozadinaPdf[] = [],
): DokumentPdf {
  const m = mapaRijeci(rijeci);
  return {
    naslov: b.naslov, podnozje: `${b.naslov} · logomedo.com`, ukrasi: TEME[b.tema ?? "bozic"].kutovi,
    naslovnica: { naslov: b.naslov, uputa: TEME[b.tema ?? "bozic"].uputaIspisa, lampica, tema: b.tema ?? "bozic" },
    stranice: zadaci.filter((z) => z.vrsta !== "listic")
      .flatMap((z) => tijelaZadatka(z.vrsta, z.sadrzaj, m, true, pozadine).map((tijelo) => ({
        // Pitanje scene je sadržaj zadatka; ostale vrste imaju uputu za papir.
        uputa: z.vrsta === "scena" ? `${z.uputa?.trim() || VRSTE.scena.uputa} ${VRSTE.scena.ispis}.` : zadanaUputa(z.vrsta, z.sadrzaj), tijelo,
      }))),
  };
}

/** Svi URL-ovi slika u dokumentu (za dohvat prije slaganja). */
export function slikeDokumenta(d: DokumentPdf): string[] {
  const out = new Set<string>();
  const dodaj = (s: SlikaPdf | null) => { if (s?.url) out.add(s.url); };
  for (const { tijelo: t } of d.stranice) {
    if (t.vrsta === "odabir") t.redovi.forEach((r) => [r.zadana, ...r.ponudeno].forEach(dodaj));
    if (t.vrsta === "uljez" || t.vrsta === "percepcija") t.redovi.flat().forEach(dodaj);
    if (t.vrsta === "prvi_glas" || t.vrsta === "slogovi") t.slike.forEach(dodaj);
    if (t.vrsta === "povezivanje") [...t.lijevo, ...t.desno].forEach(dodaj);
    if (t.vrsta === "listic") t.kartice.forEach((k) => dodaj(k.slika));
    if (t.vrsta === "scena") { if (t.pozadina) out.add(t.pozadina); t.gumbi.forEach(dodaj); }
  }
  for (const sl of slojevi(d.okvir).slike) out.add(sl.url);
  return [...out];
}

/** Slike koje na papiru zauzimaju pola stranice (pozadine scena): smanjuju se manje. */
export function velikeSlike(d: DokumentPdf): Set<string> {
  return new Set(d.stranice.flatMap(({ tijelo: t }) => (t.vrsta === "scena" && t.pozadina ? [t.pozadina] : [])));
}
