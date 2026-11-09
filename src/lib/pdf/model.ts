// Model dokumenta za ispis: iste stranice crta PDF (ispis-pdf.ts). Raspodjela po stranicama
// je ista kao u HTML ispisu bilježnice: odabir 3 reda, uljez i percepcija 4 reda, povezivanje 1 stranica,
// listić 12 kartica (3 × 4, kao stari LogoMedo).

import type { Tema } from "../teme.ts";
import { TEME } from "../teme.ts";
import { VRSTE, zadanaUputa, BOJE_DULJINE, type RasporedListica, type Slogovi, type Izmjena, type Listic, type Odabir, type Percepcija, type PrviGlas, type Povezivanje, type Sadrzaj, type Scena, type Uljez, type Vrsta } from "../zadaci/vrste.ts";

/** Slika na papiru: URL (ili null, tada se u okviru ispiše riječ) i natpis ispod (ili ""). */
export interface SlikaPdf { url: string | null; rijec: string; natpis: string; izmjena?: Izmjena }

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
}

export interface DokumentPdf {
  naslov: string;
  /** Tekst u podnožju svake stranice. */
  podnozje: string;
  /** Grančice jele u kutovima (bilježnica). */
  ukrasi?: boolean;
  /** Naslovnica bilježnice s borom za bojanje. */
  naslovnica?: { naslov: string; uputa: string; lampica: number; tema?: Tema };
  stranice: StranicaPdf[];
}

export interface RijecPdf { id: number; rijec: string; slika: string | null }
/** Pozadina scene za papir: A4 je uspravan, pa uspravna slika ima prednost. */
export interface PozadinaPdf { id: number; uspravno: { url: string } | null; vodoravno: { url: string } | null }
const urlPozadine = (pozadine: PozadinaPdf[], id: number | null) => {
  const p = pozadine.find((x) => x.id === id);
  return p ? (p.uspravno ?? p.vodoravno)?.url ?? null : null;
};

const komadi = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
/** Prvi komad `prvi`, ostali `ostali` (prva stranica ima zaglavlje, ostale ne). */
export const komadiSPrvim = <T>(a: T[], prvi: number, ostali: number): T[][] =>
  a.length <= prvi ? (a.length ? [a] : []) : [a.slice(0, prvi), ...komadi(a.slice(prvi), ostali)];
export const VELIKO = (s: string) => s.toLocaleUpperCase("hr");

/**
 * Stranice (bez zaglavlja) jednog zadatka. `nastavakBezZaglavlja`: samo prva stranica ima naslov, uputu
 * i ime (samostalan zadatak), pa od druge stane red više (odabir 3 → 4, uljez i percepcija 4 → 5).
 */
export function tijelaZadatka(vrsta: Vrsta, s: Sadrzaj, rijeci: Map<number, RijecPdf>, sRijecima = true, pozadine: PozadinaPdf[] = [], nastavakBezZaglavlja = false): TijeloPdf[] {
  const dijeli = <T>(a: T[], n: number) => (nastavakBezZaglavlja ? komadiSPrvim(a, n, n + 1) : komadi(a, n));
  const sl = (id: number | null): SlikaPdf => {
    const r = id === null ? undefined : rijeci.get(id);
    if (!r) return { url: null, rijec: "?", natpis: "" };
    // Bez slike je riječ već u okviru, pa natpis ne treba.
    return { url: r.slika, rijec: VELIKO(r.rijec), natpis: sRijecima && r.slika ? VELIKO(r.rijec) : "" };
  };
  if (vrsta === "odabir")
    return dijeli((s as Odabir).stavke, 3).map((k) => ({ vrsta: "odabir", redovi: k.map((x) => ({ zadana: sl(x.zadana), ponudeno: x.ponudeno.map(sl) })) }));
  if (vrsta === "uljez")
    return dijeli((s as Uljez).stavke, 4).map((k) => ({ vrsta: "uljez", redovi: k.map((x) => x.slike.map(sl)) }));
  if (vrsta === "percepcija")
    return dijeli((s as Percepcija).stavke, 4).map((k) => ({
      vrsta: "percepcija",
      redovi: k.map((x) => x.polja.map((p) => {
        const o = sl(p.rijec_id);
        // Natpis bi odao različitu riječ; siva slika ima svoj URL.
        return { ...o, natpis: "", izmjena: p.izmjena, url: o.url && p.izmjena === "siva" ? o.url + SIVA : o.url };
      })),
    }));
  if (vrsta === "prvi_glas")
    // Krug po stranici: slovo u krugu i do 15 slika. Natpis bi odao prvi glas.
    return (s as PrviGlas).krugovi.filter((k) => k.slovo).map((k) => ({
      vrsta: "prvi_glas", slovo: k.slovo!, slike: k.slike.filter((id) => id !== null).map((id) => ({ ...sl(id), natpis: "" })),
    }));
  if (vrsta === "slogovi") {
    // Duljina 4 × 3 slike, analiza 3 × 3 (krugovi trebaju mjesta); stranica bez zaglavlja red više.
    const sg = s as Slogovi;
    const po = sg.nacin === "duljina" ? 4 : 3, redova = 3;
    const slike = sg.slike.filter((x) => x.rijec_id !== null).map((x) => sl(x.rijec_id));
    const legenda = sg.nacin === "duljina" ? (["duga", "kratka"] as const).map((k) => ({ naziv: VELIKO(BOJE_DULJINE[k].naziv), boja: BOJE_DULJINE[k].boja, duga: k === "duga" })) : undefined;
    const komad = nastavakBezZaglavlja ? komadiSPrvim(slike, po * redova, po * (redova + 1)) : komadi(slike, po * redova);
    return komad.map((k) => ({ vrsta: "slogovi", legenda, krugova: sg.nacin === "analiza" ? sg.krugova : 0, slike: k }));
  }
  if (vrsta === "povezivanje") {
    const p = s as Povezivanje;
    return [{ vrsta: "povezivanje", lijevo: p.parovi.map((x) => sl(x.lijevo)), desno: p.desno_redoslijed.map((i) => sl(p.parovi[i].desno)) }];
  }
  if (vrsta === "scena") {
    const sc = s as Scena;
    return [{ vrsta: "scena", pozadina: urlPozadine(pozadine, sc.pozadina_id), gumbi: sc.gumbi.filter((g) => g.rijec_id !== null).map((g) => sl(g.rijec_id)) }];
  }
  const kartice = (s as Listic).kartice.filter((k) => k.rijec_id || k.tekst)
    .map((k) => ({ slika: k.rijec_id ? { ...sl(k.rijec_id), natpis: "" } : null, tekst: k.tekst }));
  return komadi(kartice, 12).map((k) => ({ vrsta: "listic", kartice: k, raspored: (s as Listic).raspored }));
}

/** Samostalan zadatak (admin): naslov, uputa i ime na prvoj stranici. */
export function dokumentZadatka(z: { vrsta: Vrsta; naslov: string; uputa: string; sadrzaj: Sadrzaj }, rijeci: RijecPdf[], sRijecima: boolean, pozadine: PozadinaPdf[] = []): DokumentPdf {
  const tijela = tijelaZadatka(z.vrsta, z.sadrzaj, new Map(rijeci.map((r) => [r.id, r])), sRijecima, pozadine, true);
  const naslov = z.naslov || VRSTE[z.vrsta].naziv;
  return {
    naslov, podnozje: "logomedo.com",
    stranice: (tijela.length ? tijela : [{ vrsta: "listic", kartice: [] } as TijeloPdf])
      .map((tijelo, i) => (i === 0 ? { naslov, uputa: z.uputa || undefined, ime: true, tijelo } : { tijelo })),
  };
}

/** Bilježnica: naslovnica s borom, pa zadaci; svaka stranica nosi uputu svoje vrste. */
export function dokumentBiljeznice(
  b: { naslov: string; tema?: Tema },
  zadaci: { vrsta: Vrsta; sadrzaj: Sadrzaj; uputa?: string | null }[],
  rijeci: RijecPdf[],
  lampica: number,
  pozadine: PozadinaPdf[] = [],
): DokumentPdf {
  const m = new Map(rijeci.map((r) => [r.id, r]));
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
  return [...out];
}

/** Slike koje na papiru zauzimaju pola stranice (pozadine scena): smanjuju se manje. */
export function velikeSlike(d: DokumentPdf): Set<string> {
  return new Set(d.stranice.flatMap(({ tijelo: t }) => (t.vrsta === "scena" && t.pozadina ? [t.pozadina] : [])));
}
