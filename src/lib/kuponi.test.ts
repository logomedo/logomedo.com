// Kuponi na /pristup (docs/kuponi.md): stvaranje, zauzimanje korištenja, auto-odobravanje kroz posalji().
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import { HONEYPOT, ZIG, posalji, prazanUnos } from "./pristup.ts";
import { normalizirajKod, poKodu, postaviAktivan, stvori, zauzmi } from "./admin/kuponi.ts";

const SADA = new Date("2026-11-25T12:00:00.000Z");
const SA = "sa@primjer.test";

beforeEach(() => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
  delete env.PRISTUP_TAJNA;
  delete env.RESEND_API_KEY;
});

const db = () => env.DB as D1Database;

function obrazac(polja: Record<string, string> = {}): FormData {
  const sve: Record<string, string> = {
    [ZIG]: String(SADA.getTime() - 10_000), ime: "Ana Anić", email: "Ana@Vrtic.example.test", ustanova: "Vrtić Sunce", grad: "Zagreb",
    poruka: "", privola: "da", [HONEYPOT]: "", ...polja,
  };
  const f = new FormData();
  for (const [k, v] of Object.entries(sve)) f.set(k, v);
  return f;
}

/** Lažni Resend: bilježi poslane mailove; `ok = false` glumi neuspjelo slanje. */
function resend(ok = true) {
  const poslano: Record<string, any>[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      if (!ok) return Response.json({ message: "pala" }, { status: 500 });
      poslano.push(JSON.parse(String(init.body)));
      return Response.json({ id: `em_${poslano.length}` });
    }
    return Response.json({ message_id: `<m${url.length}@primjer.test>` });
  }) as unknown as typeof fetch;
  return { f, poslano };
}

const zahtjev = () => db().prepare("SELECT status, obradio, kupon, poziv_token_hash FROM zahtjevi_pristupa").first<Record<string, unknown>>();
const kupon = async (kod: string) => (await poKodu(kod))!;

test("normalizirajKod i stvori: velika slova, oblik, duplikat, datum, broj korištenja", async () => {
  assert.equal(normalizirajKod(" split 2026 "), "SPLIT2026");
  assert.deepEqual(await stvori({ kod: "split-2026", autoOdobri: true, pogodnost: null }, SA, SADA), { ok: true, kod: "SPLIT-2026" });
  assert.equal((await stvori({ kod: "Split-2026", autoOdobri: true, pogodnost: null }, SA, SADA)).ok, false);
  assert.equal((await stvori({ kod: "ab", autoOdobri: true, pogodnost: null }, SA, SADA)).ok, false);
  assert.equal((await stvori({ kod: "ŠIBENIK", autoOdobri: true, pogodnost: null }, SA, SADA)).ok, false);
  assert.equal((await stvori({ kod: "STARI", autoOdobri: true, pogodnost: null, vrijediDo: "2026-11-24" }, SA, SADA)).ok, false);
  assert.equal((await stvori({ kod: "NULA", autoOdobri: true, pogodnost: null, maxKoristenja: "0" }, SA, SADA)).ok, false);
  assert.ok((await stvori({ kod: "DANAS", autoOdobri: true, pogodnost: null, vrijediDo: "2026-11-25", maxKoristenja: "2" }, SA, SADA)).ok);
  const k = await kupon("danas");
  assert.equal(k.vrijedi_do, "2026-11-25T23:59:59.999Z");
  assert.equal(k.max_koristenja, 2);
});

test("zauzmi: poštuje max, istek, isključen i auto_odobri", async () => {
  await stvori({ kod: "DVAPUT", autoOdobri: true, pogodnost: null, maxKoristenja: "2" }, SA, SADA);
  await stvori({ kod: "RUCNO", autoOdobri: false, pogodnost: null }, SA, SADA);
  await stvori({ kod: "ISTJECE", autoOdobri: true, pogodnost: null, vrijediDo: "2026-11-26" }, SA, SADA);
  assert.ok(await zauzmi("dvaput", SADA));
  assert.ok(await zauzmi("DVAPUT", SADA));
  assert.equal(await zauzmi("DVAPUT", SADA), null);
  assert.equal(await zauzmi("RUCNO", SADA), null);
  assert.equal(await zauzmi("NEMA", SADA), null);
  assert.ok(await zauzmi("ISTJECE", SADA));
  assert.equal(await zauzmi("ISTJECE", new Date("2026-11-27T00:00:00Z")), null);
  const k = await kupon("ISTJECE");
  await postaviAktivan(k.id, false);
  assert.equal(await zauzmi("ISTJECE", SADA), null);
});

test("posalji s auto-kuponom: zahtjev odobren, pozivnica poslana podnositelju, pogodnost upisana, korištenje zbrojeno", async () => {
  env.RESEND_API_KEY = "re_test";
  await stvori({ kod: "SPLIT", autoOdobri: true, pogodnost: { vrsta: "mjeseci", mjeseci: 3 } }, SA, SADA);
  const { f, poslano } = resend();
  assert.deepEqual(await posalji(obrazac({ kupon: " split " }), "203.0.113.7", SADA, f, "https://primjer.test"), { vrsta: "odobreno" });
  const z = await zahtjev();
  assert.equal(z!.status, "odobren");
  assert.equal(z!.obradio, "kupon:SPLIT");
  assert.equal(z!.kupon, "SPLIT");
  assert.ok(z!.poziv_token_hash);
  assert.equal(poslano.length, 1, "samo pozivnica, bez obavijesti superadminu");
  assert.deepEqual(poslano[0].to, ["ana@vrtic.example.test"]);
  assert.ok(String(poslano[0].text).includes("https://primjer.test/admin/poziv#"));
  assert.equal((await kupon("SPLIT")).iskoristen, 1);
  const p = await db().prepare("SELECT vrsta, mjeseci, dodijelio FROM pogodnosti").first<Record<string, unknown>>();
  assert.deepEqual(p, { vrsta: "mjeseci", mjeseci: 3, dodijelio: "kupon:SPLIT" });
});

test("posalji s nevaljalim ili ručnim kuponom: običan zahtjev s upisanim kodom i obavijest", async () => {
  env.RESEND_API_KEY = "re_test";
  await stvori({ kod: "RUCNO", autoOdobri: false, pogodnost: null }, SA, SADA);
  const { f, poslano } = resend();
  assert.deepEqual(await posalji(obrazac({ kupon: "rucno" }), "203.0.113.7", SADA, f), { vrsta: "hvala" });
  const z = await zahtjev();
  assert.equal(z!.status, "novi");
  assert.equal(z!.kupon, "RUCNO");
  assert.deepEqual(poslano.map((p) => p.to), [[SA]]);
  assert.equal((await kupon("RUCNO")).iskoristen, 0);
});

test("posalji: neuspjelo slanje pozivnice vraća zahtjev u red i oslobađa korištenje", async () => {
  env.RESEND_API_KEY = "re_test";
  await stvori({ kod: "SPLIT", autoOdobri: true, pogodnost: null, maxKoristenja: "1" }, SA, SADA);
  const { f } = resend(false);
  assert.deepEqual(await posalji(obrazac({ kupon: "SPLIT" }), "203.0.113.7", SADA, f), { vrsta: "hvala" });
  const z = await zahtjev();
  assert.equal(z!.status, "novi");
  assert.equal(z!.poziv_token_hash, null);
  assert.equal((await kupon("SPLIT")).iskoristen, 0);
});

test("posalji: kupon odobrava i već otvoreni zahtjev istog e-maila; ustanova se ne odobrava sama", async () => {
  env.RESEND_API_KEY = "re_test";
  await stvori({ kod: "SPLIT", autoOdobri: true, pogodnost: null }, SA, SADA);
  const { f } = resend();
  await posalji(obrazac(), "203.0.113.7", SADA, f);
  assert.deepEqual(await posalji(obrazac({ kupon: "SPLIT", paket: "ustanova", licenci: "5" }), "203.0.113.8", SADA, f), { vrsta: "hvala" });
  assert.equal((await zahtjev())!.status, "novi");
  assert.deepEqual(await posalji(obrazac({ kupon: "SPLIT" }), "203.0.113.9", SADA, f), { vrsta: "odobreno" });
  const z = await zahtjev();
  assert.equal(z!.status, "odobren");
  assert.equal(z!.kupon, "SPLIT");
});

test("prazanUnos: kupon iz linka normaliziran", () => {
  assert.equal(prazanUnos("beta", " split-2026 ").kupon, "SPLIT-2026");
  assert.equal(prazanUnos().kupon, "");
});
