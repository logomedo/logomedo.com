// Model dokumenta za ispis: iste stranice crta PDF (ispis-pdf.ts). Raspodjela po stranicama
// je ista kao u HTML ispisu bilježnice: odabir 3 reda, uljez 4 reda, povezivanje 1 stranica,
// listić 12 kartica (3 × 4, kao stari LogoMedo).

import { VRSTE, type Listic, type Odabir, type Povezivanje, type Sadrzaj, type Scena, type Uljez, type Vrsta } from "../zadaci/vrste.ts";

/** Slika na papiru: URL (ili null, tada se u okviru ispiše riječ) i natpis ispod (ili ""). */
export interface SlikaPdf { url: string | null; rijec: string; natpis: string }

export type TijeloPdf =
  | { vrsta: "odabir"; redovi: { zadana: SlikaPdf; ponudeno: SlikaPdf[] }[] }
  | { vrsta: "uljez"; redovi: SlikaPdf[][] }
  | { vrsta: "povezivanje"; lijevo: SlikaPdf[]; desno: SlikaPdf[] }
  | { vrsta: "listic"; kartice: { slika: SlikaPdf | null; tekst: string }[] }
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
  naslovnica?: { naslov: string; uputa: string; lampica: number };
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
export const VELIKO = (s: string) => s.toLocaleUpperCase("hr");

/** Stranice (bez zaglavlja) jednog zadatka. */
export function tijelaZadatka(vrsta: Vrsta, s: Sadrzaj, rijeci: Map<number, RijecPdf>, sRijecima = true, pozadine: PozadinaPdf[] = []): TijeloPdf[] {
  const sl = (id: number | null): SlikaPdf => {
    const r = id === null ? undefined : rijeci.get(id);
    if (!r) return { url: null, rijec: "?", natpis: "" };
    // Bez slike je riječ već u okviru, pa natpis ne treba.
    return { url: r.slika, rijec: VELIKO(r.rijec), natpis: sRijecima && r.slika ? VELIKO(r.rijec) : "" };
  };
  if (vrsta === "odabir")
    return komadi((s as Odabir).stavke, 3).map((k) => ({ vrsta: "odabir", redovi: k.map((x) => ({ zadana: sl(x.zadana), ponudeno: x.ponudeno.map(sl) })) }));
  if (vrsta === "uljez")
    return komadi((s as Uljez).stavke, 4).map((k) => ({ vrsta: "uljez", redovi: k.map((x) => x.slike.map(sl)) }));
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
  return komadi(kartice, 12).map((k) => ({ vrsta: "listic", kartice: k }));
}

/** Samostalan zadatak (admin): naslov, uputa i ime na prvoj stranici. */
export function dokumentZadatka(z: { vrsta: Vrsta; naslov: string; uputa: string; sadrzaj: Sadrzaj }, rijeci: RijecPdf[], sRijecima: boolean, pozadine: PozadinaPdf[] = []): DokumentPdf {
  const tijela = tijelaZadatka(z.vrsta, z.sadrzaj, new Map(rijeci.map((r) => [r.id, r])), sRijecima, pozadine);
  const naslov = z.naslov || VRSTE[z.vrsta].naziv;
  return {
    naslov, podnozje: "logomedo.com",
    stranice: (tijela.length ? tijela : [{ vrsta: "listic", kartice: [] } as TijeloPdf])
      .map((tijelo, i) => (i === 0 ? { naslov, uputa: z.uputa || undefined, ime: true, tijelo } : { tijelo })),
  };
}

/** Bilježnica: naslovnica s borom, pa zadaci; svaka stranica nosi uputu svoje vrste. */
export function dokumentBiljeznice(
  b: { naslov: string },
  zadaci: { vrsta: Vrsta; sadrzaj: Sadrzaj; uputa?: string | null }[],
  rijeci: RijecPdf[],
  lampica: number,
  pozadine: PozadinaPdf[] = [],
): DokumentPdf {
  const m = new Map(rijeci.map((r) => [r.id, r]));
  return {
    naslov: b.naslov, podnozje: `${b.naslov} · logomedo.com`, ukrasi: true,
    naslovnica: { naslov: b.naslov, uputa: "Za svaki točno riješen red oboji jednu lampicu na boru.", lampica },
    stranice: zadaci.filter((z) => z.vrsta !== "listic")
      .flatMap((z) => tijelaZadatka(z.vrsta, z.sadrzaj, m, true, pozadine).map((tijelo) => ({
        // Pitanje scene je sadržaj zadatka; ostale vrste imaju uputu za papir.
        uputa: z.vrsta === "scena" ? `${z.uputa?.trim() || VRSTE.scena.uputa} ${VRSTE.scena.ispis}.` : VRSTE[z.vrsta].uputa, tijelo,
      }))),
  };
}

/** Svi URL-ovi slika u dokumentu (za dohvat prije slaganja). */
export function slikeDokumenta(d: DokumentPdf): string[] {
  const out = new Set<string>();
  const dodaj = (s: SlikaPdf | null) => { if (s?.url) out.add(s.url); };
  for (const { tijelo: t } of d.stranice) {
    if (t.vrsta === "odabir") t.redovi.forEach((r) => [r.zadana, ...r.ponudeno].forEach(dodaj));
    if (t.vrsta === "uljez") t.redovi.flat().forEach(dodaj);
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
