// Uplate i računi kroz domovina-fiskal (migrations/0048, docs/naplata.md). Uplata se upiše, zahtjev se odobri
// (pozivnica), a račun izda i dostavi tenant ITalk d.o.o. u domovina-fiskal (POST /api/v1/racun, pa /posalji ili
// /posalji-eracun). Izdavanje je idempotentno (vanjskaReferenca po uplati), pa „Ponovi” nikad ne izda drugi račun.
//
// Staging je kopija produkcijske D1 sa stvarnim adresama: dok je OKRUZENJE "staging", račun e-poštom ide samo
// superadminu koji je unio uplatu, nikad kupcu.
import { env } from "cloudflare:workers";
import {
  ispravanOib, stavkaPaketa, tijeloRacuna, vrstaRacuna,
  type Kupac, type KupacTip, type Nacin, type PlaceniPaket, type TipRacuna,
} from "../naplata.ts";
import { odobri, type IshodOdobravanja } from "./zahtjevi.ts";

export type StatusRacuna = "ceka" | "izdan" | "poslan" | "greska";

export interface Uplata {
  id: number; zahtjev_id: number | null; email: string; paket: PlaceniPaket; broj_licenci: number; iznos_centi: number;
  nacin: Nacin; izvor: string; kupac_tip: KupacTip; kupac_naziv: string; kupac_oib: string | null;
  kupac_ulica: string | null; kupac_grad: string | null; kupac_postanski_broj: string | null; trazi_eracun: number;
  placeno_at: string; unio: string; racun_tip: TipRacuna | null; racun_status: StatusRacuna; fiskal_url: string | null;
  fiskal_id: number | null; broj_racuna: string | null; jir: string | null; dostava: string | null; greska: string | null;
}

/** Simulacija plaćanja na /admin/zahtjevi: samo uz NAPLATA_SIMULACIJA = "da" (staging), nikad na produkciji. */
export const simulacijaDopustena = () => env.NAPLATA_SIMULACIJA === "da" && env.OKRUZENJE === "staging";
export const fiskalPostavljen = () => Boolean(env.FISKAL_URL && env.FISKAL_API_KLJUC && env.FISKAL_OPERATER_OIB);

export interface UnosUplate {
  nacin: Nacin; kupacTip: KupacTip; naziv: string; oib: string; ulica: string; grad: string; postanskiBroj: string;
  traziEracun: boolean;
}

const tekst = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max);

export function procitajUnos(f: FormData): UnosUplate {
  return {
    nacin: f.get("nacin") === "sepa" ? "sepa" : "kartica",
    kupacTip: (["fizicka", "pravna", "drzava"] as const).find((k) => k === f.get("kupac_tip")) ?? "fizicka",
    naziv: tekst(f.get("naziv"), 300), oib: tekst(f.get("oib"), 11), ulica: tekst(f.get("ulica")),
    grad: tekst(f.get("grad"), 100), postanskiBroj: tekst(f.get("postanski_broj"), 16),
    traziEracun: f.get("eracun") === "da",
  };
}

/** Greška unosa ili null. Firma i ustanova trebaju OIB (eRačun i OIB primatelja na fiskaliziranom računu). */
export function provjeriUnos(u: UnosUplate): string | null {
  if (!u.naziv) return "Upiši ime i prezime ili naziv kupca.";
  if (u.kupacTip !== "fizicka" && !ispravanOib(u.oib)) return "Firma ili ustanova treba ispravan OIB.";
  if (u.kupacTip === "fizicka" && u.oib && !ispravanOib(u.oib)) return "OIB nije ispravan (ili ga ostavi prazno).";
  return null;
}

export type IshodUplate =
  | { ok: true; uplata: Uplata; odobravanje: IshodOdobravanja }
  | { ok: false; greska: string };

/**
 * Plaćeno: upiši uplatu za zahtjev, odobri ga (pozivnica) i izdaj račun. Uplata se upisuje prva i ostaje i kad
 * odobravanje ne prođe (npr. osoba već ima račun): novac je stigao, račun se mora izdati.
 */
export async function plati(
  zahtjevId: number, u: UnosUplate, izvor: "simulacija" | "rucno", tko: string, sada = new Date(), dohvat: typeof fetch = fetch,
): Promise<IshodUplate> {
  const z = await env.DB.prepare("SELECT id, email, paket, broj_licenci, status FROM zahtjevi_pristupa WHERE id = ?")
    .bind(zahtjevId).first<{ id: number; email: string; paket: string; broj_licenci: number | null; status: string }>();
  if (!z) return { ok: false, greska: "Zahtjev ne postoji." };
  if (z.paket === "beta") return { ok: false, greska: "Besplatni beta zahtjev nema što platiti." };
  const paket = z.paket as PlaceniPaket;
  const licenci = paket === "ustanova" ? (z.broj_licenci ?? 1) : 1;
  const stavka = stavkaPaketa(paket, licenci);
  if (!stavka) return { ok: false, greska: "Za 50 i više licenci cijena je po dogovoru; to se još ne naplaćuje ovdje." };
  const greska = provjeriUnos(u);
  if (greska) return { ok: false, greska };

  const at = sada.toISOString();
  const red = await env.DB.prepare(
    `INSERT INTO uplate (zahtjev_id, email, paket, broj_licenci, iznos_centi, nacin, izvor, kupac_tip, kupac_naziv, kupac_oib,
       kupac_ulica, kupac_grad, kupac_postanski_broj, trazi_eracun, placeno_at, unio, azurirano_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (zahtjev_id) WHERE zahtjev_id IS NOT NULL DO NOTHING RETURNING id`,
  ).bind(
    z.id, z.email, paket, licenci, Math.round(stavka.bruto * 100) * licenci, u.nacin, izvor, u.kupacTip, u.naziv, u.oib || null,
    u.ulica || null, u.grad || null, u.postanskiBroj || null, u.traziEracun ? 1 : 0, at, tko, at,
  ).first<{ id: number }>();
  if (!red) return { ok: false, greska: "Za ovaj zahtjev uplata je već upisana (vidi „Uplate i računi”)." };

  const odobravanje: IshodOdobravanja = z.status === "novi" ? await odobri(z.id, tko, sada) : { ok: false, razlog: "obradjen" };
  const uplata = await izdajRacun(red.id, tko, sada, dohvat);
  return { ok: true, uplata, odobravanje };
}

export async function uplata(id: number): Promise<Uplata | null> {
  return env.DB.prepare("SELECT * FROM uplate WHERE id = ?").bind(id).first<Uplata>();
}

export async function zadnjeUplate(koliko = 20): Promise<Uplata[]> {
  return (await env.DB.prepare("SELECT * FROM uplate ORDER BY placeno_at DESC, id DESC LIMIT ?").bind(koliko).all<Uplata>()).results;
}

/** Idempotencijski ključ u domovina-fiskal: okolina + id uplate (staging i produkcija imaju iste id-ove). */
const referenca = (id: number) => `logomedo-${env.OKRUZENJE === "staging" ? "staging" : "prod"}-uplata-${id}`;

async function fiskal(dohvat: typeof fetch, put: string, tijelo: unknown, kljuc?: string) {
  const r = await dohvat(`${env.FISKAL_URL}/api/v1${put}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.FISKAL_API_KLJUC}`, "content-type": "application/json",
      ...(kljuc ? { "idempotency-key": kljuc } : {}),
    },
    body: JSON.stringify(tijelo),
    signal: AbortSignal.timeout(25_000),
  });
  const json = await r.json().catch(() => ({})) as Record<string, any>;
  return { status: r.status, json };
}

const opisGreske = (j: Record<string, any>) =>
  [j.greska, ...(Array.isArray(j.detalji) ? j.detalji.map((d: any) => `${d.polje}: ${d.poruka}`) : [])].filter(Boolean).join("; ") || "nepoznata greška";

/**
 * Izdaj (ili, ako je već izdan, samo dostavi) račun za uplatu. Sigurno za ponavljanje: domovina-fiskal po
 * vanjskaReferenca vraća postojeći dokument. Vraća uplatu nakon pokušaja.
 */
export async function izdajRacun(id: number, tko: string, sada = new Date(), dohvat: typeof fetch = fetch): Promise<Uplata> {
  const u = await uplata(id);
  if (!u) throw new Error(`uplata ${id} ne postoji`);
  const zapisi = async (polja: Partial<Uplata>) => {
    const k = Object.keys(polja);
    await env.DB.prepare(`UPDATE uplate SET ${k.map((x) => `${x} = ?`).join(", ")}, azurirano_at = ? WHERE id = ?`)
      .bind(...k.map((x) => (polja as any)[x]), new Date().toISOString(), id).run();
    return (await uplata(id))!;
  };
  if (!fiskalPostavljen()) return zapisi({ racun_status: "greska", greska: "domovina-fiskal nije postavljen (FISKAL_URL, FISKAL_API_KLJUC, FISKAL_OPERATER_OIB)." });
  if (u.racun_status === "poslan") return u;

  const vrsta = vrstaRacuna(u.nacin, u.kupac_tip, u.trazi_eracun === 1);
  const stavka = stavkaPaketa(u.paket, u.broj_licenci)!;
  const kupac: Kupac = {
    tip: u.kupac_tip, naziv: u.kupac_naziv, oib: u.kupac_oib, email: u.email,
    ulica: u.kupac_ulica, grad: u.kupac_grad, postanskiBroj: u.kupac_postanski_broj,
  };
  const datum = u.placeno_at.slice(0, 10);
  const tijelo = tijeloRacuna({
    vrsta, stavka, kupac, prostor: env.FISKAL_PROSTOR ?? "PP1", uredaj: env.FISKAL_UREDAJ ?? "2",
    operaterOib: env.FISKAL_OPERATER_OIB!, referenca: referenca(id), datum,
  });

  let r;
  try {
    r = await fiskal(dohvat, "/racun", tijelo, referenca(id));
  } catch (e) {
    return zapisi({ racun_tip: vrsta.tip, racun_status: "greska", greska: `domovina-fiskal ne odgovara: ${(e as Error).message}` });
  }
  if (r.status !== 200 && r.status !== 201) {
    return zapisi({ racun_tip: vrsta.tip, racun_status: "greska", greska: `Izdavanje (${r.status}): ${opisGreske(r.json)}`, fiskal_id: r.json.racunId ?? null });
  }
  let stanje = await zapisi({
    racun_tip: vrsta.tip, racun_status: "izdan", fiskal_url: env.FISKAL_URL!, fiskal_id: r.json.id,
    broj_racuna: r.json.brojRacuna ?? null, jir: r.json.jir ?? null, greska: null,
  });

  // Dostava: fiskalizirani račun e-poštom (PDF), eRačun kroz posrednika (doku) u sustav primatelja.
  try {
    if (vrsta.tip === "FISKALNI_B2C") {
      const na = env.OKRUZENJE === "staging" ? tko : u.email;
      const d = await fiskal(dohvat, `/racun/${r.json.id}/posalji`, { na });
      if (d.status === 200) stanje = await zapisi({ racun_status: "poslan", dostava: `e-pošta: ${na}`, greska: null });
      else stanje = await zapisi({ greska: d.json.kod === "NEMA_JIR" ? "Čeka JIR (CIS); pokušaj ponovno za minutu." : `Slanje e-poštom (${d.status}): ${opisGreske(d.json)}` });
    } else {
      const d = await fiskal(dohvat, `/racun/${r.json.id}/posalji-eracun`, {});
      if (d.status === 200 && d.json.ok) {
        const blok = d.json.deliveryBlock ? `, blokada: ${d.json.deliveryBlock}` : "";
        stanje = await zapisi({ racun_status: "poslan", dostava: `eRačun: ${d.json.eracunStatus ?? "poslan"}${blok}`, greska: d.json.napomena ?? null });
      } else stanje = await zapisi({ greska: `Slanje eRačuna (${d.status}): ${opisGreske(d.json)}` });
    }
  } catch (e) {
    stanje = await zapisi({ greska: `Dostava nije uspjela: ${(e as Error).message}` });
  }
  return stanje;
}

/** PDF računa iz domovina-fiskala (za superadmina; ključ ostaje na serveru). */
export async function pdfRacuna(id: number, dohvat: typeof fetch = fetch): Promise<Response | null> {
  const u = await uplata(id);
  if (!u?.fiskal_id || !fiskalPostavljen() || u.fiskal_url !== env.FISKAL_URL) return null;
  const r = await dohvat(`${env.FISKAL_URL}/api/v1/racun/${u.fiskal_id}/pdf`, { headers: { authorization: `Bearer ${env.FISKAL_API_KLJUC}` } });
  if (!r.ok) return null;
  return new Response(r.body, {
    headers: {
      "content-type": "application/pdf", "cache-control": "private, no-store",
      "content-disposition": `inline; filename="racun-${(u.broj_racuna ?? String(u.id)).replace(/[^\w-]/g, "-")}.pdf"`,
    },
  });
}
