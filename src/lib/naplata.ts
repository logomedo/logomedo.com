// Pravila naplate (docs/naplata.md): koja vrsta računa ide za koju uplatu i što piše na stavci. Čisti TS, bez
// `cloudflare:workers`, da ga koriste i testovi i (kasnije) webhook platnog servisa.
//
// Vrstu računa određuje način plaćanja, ne samo kupac:
// - građanin: uvijek fiskalizirani račun (od 2026. svi B2C računi, neovisno o načinu plaćanja);
// - firma ili ustanova, kartica: fiskalizirani račun s OIB-om kupca i napomenom po čl. 39 Zakona o fiskalizaciji
//   (kartica = gotovina, pa se eRačun ne izdaje), osim ako kupac traži eRačun;
// - firma ili ustanova, SEPA/virman: eRačun je obavezan (B2B, a javnim ustanovama B2G).
import { cijenaLicence, CIJENE, PDV } from "../landing/konstante.ts";

export type Nacin = "kartica" | "sepa";
export type KupacTip = "fizicka" | "pravna" | "drzava";
export type TipRacuna = "FISKALNI_B2C" | "ERACUN_B2B" | "ERACUN_B2G";
export type PlaceniPaket = "mjesecno" | "godisnje" | "dozivotno" | "ustanova";

export const NACINI: { kod: Nacin; tekst: string }[] = [
  { kod: "kartica", tekst: "Kartica" },
  { kod: "sepa", tekst: "SEPA instant (uplata po ponudi)" },
];
export const KUPCI: { kod: KupacTip; tekst: string }[] = [
  { kod: "fizicka", tekst: "Fizička osoba" },
  { kod: "pravna", tekst: "Firma ili obrt" },
  { kod: "drzava", tekst: "Javna ustanova (škola, vrtić…)" },
];
export const TIP_TEKST: Record<TipRacuna, string> = {
  FISKALNI_B2C: "fiskalizirani račun",
  ERACUN_B2B: "eRačun (B2B)",
  ERACUN_B2G: "eRačun (B2G)",
};

/** KPD 2025 „Ostale aplikacije na internetu” (pristup web aplikaciji). ⚠️ Potvrditi s knjigovođom. */
export const KPD_LICENCE = "58.29.36";
export const NAPOMENA_CL39 = "U skladu s člankom 39. Zakona o fiskalizaciji, ovaj račun nije izdan kao eRačun.";

export interface VrstaRacuna { tip: TipRacuna; nacinPlacanja: "KARTICA" | "TRANSAKCIJSKI"; napomena: string | null }

export function vrstaRacuna(nacin: Nacin, kupac: KupacTip, traziEracun: boolean): VrstaRacuna {
  const nacinPlacanja = nacin === "kartica" ? "KARTICA" : "TRANSAKCIJSKI";
  if (kupac === "fizicka") return { tip: "FISKALNI_B2C", nacinPlacanja, napomena: null };
  if (nacin === "kartica" && !traziEracun) return { tip: "FISKALNI_B2C", nacinPlacanja, napomena: NAPOMENA_CL39 };
  return { tip: kupac === "drzava" ? "ERACUN_B2G" : "ERACUN_B2B", nacinPlacanja, napomena: null };
}

export interface Stavka { naziv: string; kolicina: number; bruto: number; neto: string }

/** Neto cijena (bez PDV-a) iz krajnje cijene s PDV-om, kao string s dvije decimale za domovina-fiskal. */
export const netoIzBruto = (bruto: number) => (Math.round((bruto / (1 + PDV)) * 100) / 100).toFixed(2);

/** Stavka računa za paket; null za ustanovu s 50+ licenci (cijena po dogovoru). */
export function stavkaPaketa(paket: PlaceniPaket, licenci = 1): Stavka | null {
  if (paket === "ustanova") {
    const c = cijenaLicence(licenci);
    if (c === null) return null;
    return { naziv: "LogoMedo, godišnja licenca za jednu osobu (ustanova)", kolicina: licenci, bruto: c, neto: netoIzBruto(c) };
  }
  const p = CIJENE.find((x) => x.id === paket)!;
  const naziv = { mjesecno: "LogoMedo, mjesečna licenca za jednu osobu", godisnje: "LogoMedo, godišnja licenca za jednu osobu", dozivotno: "LogoMedo, doživotna licenca za jednu osobu" }[paket];
  return { naziv, kolicina: 1, bruto: p.iznos, neto: netoIzBruto(p.iznos) };
}

const OIB = /^\d{11}$/;
/** OIB: 11 znamenki i kontrolna znamenka (ISO 7064, MOD 11,10). */
export function ispravanOib(oib: string): boolean {
  if (!OIB.test(oib)) return false;
  let a = 10;
  for (let i = 0; i < 10; i++) {
    a = (a + Number(oib[i])) % 10;
    a = ((a === 0 ? 10 : a) * 2) % 11;
  }
  const k = (11 - a) % 10;
  return k === Number(oib[10]);
}

export interface Kupac {
  tip: KupacTip; naziv: string; oib: string | null; email: string;
  ulica: string | null; grad: string | null; postanskiBroj: string | null;
}

/** Tijelo za POST /api/v1/racun domovina-fiskala. */
export function tijeloRacuna(o: {
  vrsta: VrstaRacuna; stavka: Stavka; kupac: Kupac; prostor: string; uredaj: string; operaterOib: string;
  referenca: string; datum: string;
}) {
  const { vrsta, stavka, kupac } = o;
  const adresa = kupac.ulica || kupac.grad || kupac.postanskiBroj
    ? { ulica: kupac.ulica ?? undefined, grad: kupac.grad ?? undefined, postanskiBroj: kupac.postanskiBroj ?? undefined, drzava: "HR" }
    : undefined;
  return {
    tip: vrsta.tip,
    poslovniProstor: o.prostor,
    naplatniUredaj: o.uredaj,
    operaterOib: o.operaterOib,
    nacinPlacanja: vrsta.nacinPlacanja,
    // Plaćeno je prije izdavanja: dospijeće je dan uplate.
    datumDospijeca: o.datum,
    datumIsporuke: o.datum,
    ...(vrsta.napomena ? { napomena: vrsta.napomena } : {}),
    kupac: {
      naziv: kupac.naziv,
      // OIB građanina se ne šalje (CIS greška 181 kad je OibPrimateljaRacuna fizička osoba).
      ...(kupac.tip !== "fizicka" && kupac.oib ? { oib: kupac.oib } : {}),
      email: kupac.email,
      tip: kupac.tip,
      ...(adresa ? { adresa } : {}),
    },
    stavke: [{
      naziv: stavka.naziv, kolicina: stavka.kolicina, jedinicaMjere: "C62", netoCijena: stavka.neto,
      pdvStopa: "25", pdvKategorija: "S", kpd: KPD_LICENCE,
    }],
    vanjskaReferenca: o.referenca,
  };
}
