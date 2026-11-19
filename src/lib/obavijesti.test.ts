// Obavijesti superadminu (S4 inboxa): bez ključa i bez primatelja ne zove mrežu; mail ide na ADMIN_EMAILS bez
// sadržaja poruke; najviše jedna na sat po razgovoru (i za zahtjeve); neuspjeh oslobađa mjesto; webhook i /pristup
// je šalju. Bez mreže.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import { POSILJATELJ_OBAVIJESTI, obavijesti, sadrzajObavijesti } from "./obavijesti.ts";

type Poziv = { url: string; body: Record<string, unknown> };
let pozivi: Poziv[] = [];
let status = 200;
const f = (async (url: string, init?: RequestInit) => {
  pozivi.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
  return new Response(JSON.stringify({ id: "ob_1" }), { status });
}) as unknown as typeof fetch;

beforeEach(() => {
  env.DB = napraviD1();
  env.RESEND_API_KEY = "re_test";
  env.ADMIN_EMAILS = "sa@primjer.test, drugi@primjer.test";
  pozivi = [];
  status = 200;
});

const T0 = new Date("2026-11-19T10:00:00.000Z");
const za = (min: number) => new Date(T0.getTime() + min * 60_000);

test("bez ključa ili primatelja: ništa, bez mreže", async () => {
  delete env.RESEND_API_KEY;
  assert.equal(await obavijesti({ vrsta: "zahtjev" }, f, T0), "nema_kljuca");
  env.RESEND_API_KEY = "re_test";
  env.ADMIN_EMAILS = " ";
  assert.equal(await obavijesti({ vrsta: "zahtjev" }, f, T0), "nema_primatelja");
  assert.equal(pozivi.length, 0);
});

test("poruka: na sve superadmine, link na razgovor, bez sadržaja", async () => {
  assert.equal(await obavijesti({ vrsta: "poruka", razgovorId: 7 }, f, T0), "poslano");
  assert.equal(pozivi.length, 1);
  const b = pozivi[0].body;
  assert.equal(pozivi[0].url, "https://api.resend.com/emails");
  assert.equal(b.from, POSILJATELJ_OBAVIJESTI);
  assert.deepEqual(b.to, ["sa@primjer.test", "drugi@primjer.test"]);
  assert.equal(b.subject, "Nova poruka u LogoMedu");
  assert.ok(String(b.text).includes("https://logomedo.com/admin/poruke/7"));
  assert.ok(String(b.html).includes("https://logomedo.com/admin/poruke/7"));
  assert.ok(!String(b.html).includes("{{"), "svi placeholderi popunjeni");
});

test("najviše jedna na sat po razgovoru; drugi razgovor i zahtjevi neovisno", async () => {
  assert.equal(await obavijesti({ vrsta: "poruka", razgovorId: 1 }, f, T0), "poslano");
  assert.equal(await obavijesti({ vrsta: "poruka", razgovorId: 1 }, f, za(30)), "preskoceno");
  assert.equal(await obavijesti({ vrsta: "poruka", razgovorId: 2 }, f, za(30)), "poslano");
  assert.equal(await obavijesti({ vrsta: "zahtjev" }, f, za(30)), "poslano");
  assert.equal(await obavijesti({ vrsta: "zahtjev" }, f, za(59)), "preskoceno");
  assert.equal(await obavijesti({ vrsta: "poruka", razgovorId: 1 }, f, za(60)), "poslano");
  assert.equal(pozivi.length, 4);
});

test("neuspjelo slanje oslobađa mjesto", async () => {
  status = 500;
  assert.equal(await obavijesti({ vrsta: "poruka", razgovorId: 1 }, f, T0), "greska");
  status = 200;
  assert.equal(await obavijesti({ vrsta: "poruka", razgovorId: 1 }, f, za(1)), "poslano");
});

test("D1 padne: ne baca", async () => {
  env.DB = { prepare: () => { throw new Error("d1"); } };
  assert.equal(await obavijesti({ vrsta: "zahtjev" }, f, T0), "greska");
});

test("zahtjev: link na /admin/zahtjevi", () => {
  const s = sadrzajObavijesti({ vrsta: "zahtjev" });
  assert.equal(s.subject, "Novi zahtjev za pristup LogoMedu");
  assert.ok(s.text.includes("https://logomedo.com/admin/zahtjevi"));
});
