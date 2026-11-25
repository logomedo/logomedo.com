// Naplata (docs/naplata.md): vrsta računa po načinu plaćanja i kupcu, stavke paketa i tijek uplata → račun.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import { NAPOMENA_CL39, ispravanOib, stavkaPaketa, tijeloRacuna, vrstaRacuna } from "./naplata.ts";
import { izdajRacun, plati, provjeriUnos, simulacijaDopustena, type UnosUplate } from "./admin/uplate.ts";

const SADA = new Date("2026-11-25T12:00:00.000Z");
const SA = "sa@primjer.test";
const OIB_FIRME = "54872935051"; // javni OIB ITalka, ispravna kontrolna znamenka

test("vrsta računa: kartica je fiskalizirani račun i za firmu (čl. 39), SEPA firmi je eRačun", () => {
  assert.deepEqual(vrstaRacuna("kartica", "fizicka", false), { tip: "FISKALNI_B2C", nacinPlacanja: "KARTICA", napomena: null });
  assert.deepEqual(vrstaRacuna("sepa", "fizicka", false), { tip: "FISKALNI_B2C", nacinPlacanja: "TRANSAKCIJSKI", napomena: null });
  assert.deepEqual(vrstaRacuna("sepa", "fizicka", true).tip, "FISKALNI_B2C");
  assert.deepEqual(vrstaRacuna("kartica", "pravna", false), { tip: "FISKALNI_B2C", nacinPlacanja: "KARTICA", napomena: NAPOMENA_CL39 });
  assert.equal(vrstaRacuna("kartica", "pravna", true).tip, "ERACUN_B2B");
  assert.equal(vrstaRacuna("sepa", "pravna", false).tip, "ERACUN_B2B");
  assert.equal(vrstaRacuna("sepa", "drzava", false).tip, "ERACUN_B2G");
  assert.equal(vrstaRacuna("kartica", "drzava", false).tip, "FISKALNI_B2C");
});

test("stavke: neto + 25 % PDV daje točno cijenu s /cijene", () => {
  assert.deepEqual(stavkaPaketa("mjesecno"), { naziv: "LogoMedo, mjesečna licenca za jednu osobu", kolicina: 1, bruto: 10, neto: "8.00" });
  assert.equal(stavkaPaketa("godisnje")!.neto, "80.00");
  assert.equal(stavkaPaketa("dozivotno")!.neto, "200.00");
  for (const n of [1, 5, 10, 25, 49]) {
    const s = stavkaPaketa("ustanova", n)!;
    assert.equal(Math.round(Number(s.neto) * 1.25 * 100), Math.round(s.bruto * 100), `ustanova × ${n}`);
  }
  assert.equal(stavkaPaketa("ustanova", 50), null);
});

test("OIB: kontrolna znamenka", () => {
  assert.ok(ispravanOib(OIB_FIRME));
  assert.ok(!ispravanOib("54872935052"));
  assert.ok(!ispravanOib("123"));
});

test("tijelo računa: građaninu se OIB ne šalje, firmi da", () => {
  const osnova = { stavka: stavkaPaketa("godisnje")!, prostor: "PP1", uredaj: "2", operaterOib: "00000000001", referenca: "r-1", datum: "2026-11-25" };
  const k = { naziv: "Ana", oib: OIB_FIRME, email: "a@b.test", ulica: null, grad: null, postanskiBroj: null };
  const g = tijeloRacuna({ ...osnova, vrsta: vrstaRacuna("kartica", "fizicka", false), kupac: { ...k, tip: "fizicka" } });
  assert.equal("oib" in g.kupac, false);
  assert.equal("adresa" in g.kupac, false);
  const f = tijeloRacuna({ ...osnova, vrsta: vrstaRacuna("kartica", "pravna", false), kupac: { ...k, tip: "pravna", grad: "Zagreb" } });
  assert.equal((f.kupac as any).oib, OIB_FIRME);
  assert.equal(f.napomena, NAPOMENA_CL39);
  assert.equal(f.stavke[0].kpd, "58.29.36");
  assert.equal(f.vanjskaReferenca, "r-1");
});

// ── Tijek s lažnim domovina-fiskalom ──

beforeEach(() => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
  env.OKRUZENJE = "staging";
  env.NAPLATA_SIMULACIJA = "da";
  env.FISKAL_URL = "https://fiskal.test";
  env.FISKAL_API_KLJUC = "dfk_test";
  env.FISKAL_OPERATER_OIB = "00000000001";
  delete env.RESEND_API_KEY;
});

const db = () => env.DB as D1Database;

async function zahtjev(paket: string, email = "ana@primjer.test", licenci: number | null = null): Promise<number> {
  const r = await db().prepare(
    "INSERT INTO zahtjevi_pristupa (ime, email, privola_at, created_at, paket, broj_licenci) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
  ).bind("Ana Anić", email, SADA.toISOString(), SADA.toISOString(), paket, licenci).first<{ id: number }>();
  return r!.id;
}

/** Lažni fiskal: bilježi pozive; `jir = false` glumi CIS bez JIR-a (posalji → 409 NEMA_JIR). */
function fiskal(o: { jir?: boolean; izdavanje?: number } = {}) {
  const pozivi: { put: string; tijelo: any; kljuc: string | null }[] = [];
  const izdani = new Map<string, number>();
  const f = (async (url: string, init?: RequestInit) => {
    const put = url.replace("https://fiskal.test/api/v1", "");
    const tijelo = init?.body ? JSON.parse(String(init.body)) : null;
    const kljuc = new Headers(init?.headers).get("idempotency-key");
    pozivi.push({ put, tijelo, kljuc });
    if (put === "/racun") {
      if (o.izdavanje) return Response.json({ greska: "Validacija nije prošla", detalji: [{ polje: "kupac.oib", poruka: "loš" }] }, { status: o.izdavanje });
      const stari = izdani.get(kljuc!);
      const id = stari ?? izdani.size + 100;
      izdani.set(kljuc!, id);
      return Response.json({ id, brojRacuna: `${id - 99}/PP1/2`, jir: o.jir === false ? null : "jir-uuid" }, { status: stari ? 200 : 201 });
    }
    if (put.endsWith("/posalji")) {
      if (o.jir === false) return Response.json({ greska: "nema JIR", kod: "NEMA_JIR" }, { status: 409 });
      return Response.json({ ok: true, poslanoNa: tijelo.na });
    }
    if (put.endsWith("/posalji-eracun")) return Response.json({ ok: true, dokuId: 7, eracunStatus: "IMPORTED", deliveryBlock: null });
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  return { f, pozivi };
}

const unos = (u: Partial<UnosUplate> = {}): UnosUplate => ({
  nacin: "kartica", kupacTip: "fizicka", naziv: "Ana Anić", oib: "", ulica: "", grad: "", postanskiBroj: "", traziEracun: false, ...u,
});

test("simulacija samo na stagingu s NAPLATA_SIMULACIJA", () => {
  assert.ok(simulacijaDopustena());
  env.OKRUZENJE = undefined;
  assert.ok(!simulacijaDopustena());
});

test("provjera unosa: firma treba ispravan OIB", () => {
  assert.equal(provjeriUnos(unos()), null);
  assert.match(provjeriUnos(unos({ kupacTip: "pravna" }))!, /OIB/);
  assert.equal(provjeriUnos(unos({ kupacTip: "pravna", oib: OIB_FIRME })), null);
});

test("kartica, građanin: uplata, odobren zahtjev, fiskalizirani račun e-poštom samo superadminu na stagingu", async () => {
  const id = await zahtjev("godisnje");
  const { f, pozivi } = fiskal();
  const r = await plati(id, unos(), "simulacija", SA, SADA, f);
  assert.ok(r.ok);
  assert.equal(r.uplata.racun_tip, "FISKALNI_B2C");
  assert.equal(r.uplata.racun_status, "poslan");
  assert.equal(r.uplata.iznos_centi, 10000);
  assert.equal(r.uplata.broj_racuna, "1/PP1/2");
  assert.equal(r.uplata.dostava, `e-pošta: ${SA}`);
  assert.ok(r.odobravanje.ok);
  assert.equal(pozivi[0].kljuc, `logomedo-staging-uplata-${r.uplata.id}`);
  assert.equal(pozivi[0].tijelo.nacinPlacanja, "KARTICA");
  assert.equal(pozivi[1].tijelo.na, SA);
  const z = await db().prepare("SELECT status FROM zahtjevi_pristupa WHERE id = ?").bind(id).first<{ status: string }>();
  assert.equal(z!.status, "odobren");
  // Druga uplata za isti zahtjev se ne upisuje.
  const opet = await plati(id, unos(), "simulacija", SA, SADA, f);
  assert.equal(opet.ok, false);
});

test("SEPA, ustanova s 10 licenci: eRačun B2B kroz doku", async () => {
  const id = await zahtjev("ustanova", "vrtic@primjer.test", 10);
  const { f, pozivi } = fiskal();
  const r = await plati(id, unos({ nacin: "sepa", kupacTip: "pravna", naziv: "Vrtić Sunce", oib: OIB_FIRME }), "simulacija", SA, SADA, f);
  assert.ok(r.ok);
  assert.equal(r.uplata.racun_tip, "ERACUN_B2B");
  assert.equal(r.uplata.iznos_centi, 10 * 8500);
  assert.equal(r.uplata.dostava, "eRačun: IMPORTED");
  assert.equal(pozivi[0].tijelo.stavke[0].kolicina, 10);
  assert.equal(pozivi[0].tijelo.nacinPlacanja, "TRANSAKCIJSKI");
  assert.ok(pozivi[1].put.endsWith("/posalji-eracun"));
});

test("bez JIR-a račun ostaje izdan; „Ponovi” ne izdaje novi račun nego ga dostavi", async () => {
  const id = await zahtjev("mjesecno");
  const bez = fiskal({ jir: false });
  const r = await plati(id, unos(), "simulacija", SA, SADA, bez.f);
  assert.ok(r.ok);
  assert.equal(r.uplata.racun_status, "izdan");
  assert.match(r.uplata.greska!, /JIR/);
  const s = fiskal();
  // Isti ključ → lažni fiskal vraća isti id (kao Idempotent-Replay).
  const ponovo = await izdajRacun(r.uplata.id, SA, SADA, s.f);
  assert.equal(ponovo.racun_status, "poslan");
  assert.equal(s.pozivi[0].kljuc, bez.pozivi[0].kljuc);
});

test("greška izdavanja se zapiše, uplata ostaje", async () => {
  const id = await zahtjev("dozivotno");
  const { f } = fiskal({ izdavanje: 400 });
  const r = await plati(id, unos(), "simulacija", SA, SADA, f);
  assert.ok(r.ok);
  assert.equal(r.uplata.racun_status, "greska");
  assert.match(r.uplata.greska!, /kupac\.oib: loš/);
});

test("bez postavki fiskala nema poziva, samo zapisana greška", async () => {
  delete env.FISKAL_API_KLJUC;
  const id = await zahtjev("mjesecno");
  const { f, pozivi } = fiskal();
  const r = await plati(id, unos(), "simulacija", SA, SADA, f);
  assert.ok(r.ok);
  assert.equal(r.uplata.racun_status, "greska");
  assert.equal(pozivi.length, 0);
});
