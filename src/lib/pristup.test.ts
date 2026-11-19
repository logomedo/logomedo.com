// Obrazac /pristup (S7 landinga) na harnessu: provjera unosa, honeypot, vremenski žig, limit po IP-u,
// duplikat e-maila i retencija. Svježa D1 po testu; bez mreže.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import {
  HONEYPOT, IP_SATI, LIMIT_PO_SATU, MAX, MAX_SATI, MIN_SEKUNDI, ROK_MJESECI, ZIG,
  ipHash, istiOrigin, pocisti, posalji, procitajUnos, provjeriUnos, provjeriZig, vremenskiZig,
} from "./pristup.ts";

const SADA = new Date("2026-11-19T12:00:00.000Z");
const IP = "203.0.113.7";

beforeEach(() => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = "sa@primjer.test";
  delete env.PRISTUP_TAJNA;
});

const db = () => env.DB as D1Database;
const redovi = async () => (await db().prepare("SELECT * FROM zahtjevi_pristupa ORDER BY id").all<Record<string, unknown>>()).results;

/** Ispravno ispunjen obrazac otvoren prije 10 s; `polja` mijenja ili (null) briše polje. */
function obrazac(polja: Record<string, string | null> = {}, sada = SADA): FormData {
  const sve: Record<string, string | null> = {
    [ZIG]: String(sada.getTime() - 10_000),
    ime: "Ana Anić",
    email: "ana@vrtic.example.test",
    ustanova: "Vrtić Sunce",
    grad: "Zagreb",
    poruka: "",
    privola: "da",
    [HONEYPOT]: "",
    ...polja,
  };
  const f = new FormData();
  for (const [k, v] of Object.entries(sve)) if (v !== null) f.set(k, v);
  return f;
}

test("konstante: 3 s, 24 h, 3 na sat, 6 mjeseci, ip_hash 24 h", () => {
  assert.deepEqual([MIN_SEKUNDI, MAX_SATI, LIMIT_PO_SATU, ROK_MJESECI, IP_SATI], [3, 24, 3, 6, 24]);
});

test("procitajUnos: trim, kontrolni znakovi van, novi red u poruci ostaje, privola samo 'da'", () => {
  const f = obrazac({ ime: "  Ana\u0000 Anić ", poruka: " red 1\r\nred 2\u0007 ", privola: "on" });
  const u = procitajUnos(f);
  assert.equal(u.ime, "Ana  Anić");
  assert.equal(u.poruka, "red 1\nred 2");
  assert.equal(u.privola, false);
  assert.equal(procitajUnos(obrazac()).privola, true);
});

test("provjeriUnos: obavezna polja, e-mail, duljine; poruka nije obavezna", () => {
  assert.deepEqual(provjeriUnos(procitajUnos(obrazac())), {});
  const prazno = provjeriUnos(procitajUnos(new FormData()));
  assert.deepEqual(Object.keys(prazno).sort(), ["email", "grad", "ime", "privola", "ustanova"]);
  assert.ok(provjeriUnos(procitajUnos(obrazac({ email: "nije-email" }))).email);
  assert.ok(provjeriUnos(procitajUnos(obrazac({ email: "a b@primjer.test" }))).email);
  assert.deepEqual(provjeriUnos(procitajUnos(obrazac({ email: " ANA@Primjer.TEST " }))), {});
  assert.ok(provjeriUnos(procitajUnos(obrazac({ ime: "x".repeat(MAX.ime + 1) }))).ime);
  assert.deepEqual(provjeriUnos(procitajUnos(obrazac({ ime: "x".repeat(MAX.ime) }))), {});
  assert.ok(provjeriUnos(procitajUnos(obrazac({ ustanova: "x".repeat(MAX.ustanova + 1) }))).ustanova);
  assert.ok(provjeriUnos(procitajUnos(obrazac({ grad: "x".repeat(MAX.grad + 1) }))).grad);
  assert.ok(provjeriUnos(procitajUnos(obrazac({ poruka: "x".repeat(MAX.poruka + 1) }))).poruka);
  assert.ok(provjeriUnos(procitajUnos(obrazac({ privola: null }))).privola);
});

test("vremenski žig bez secreta: goli ms; prebrzo < 3 s, isteklo > 24 h, smeće i budućnost nevaljali", async () => {
  const t = SADA.getTime();
  assert.equal(await vremenskiZig(t), String(t));
  assert.equal(await provjeriZig(String(t - 3000), t), "valja");
  assert.equal(await provjeriZig(String(t - 2999), t), "prebrzo");
  assert.equal(await provjeriZig(String(t - 24 * 3600_000), t), "valja");
  assert.equal(await provjeriZig(String(t - 24 * 3600_000 - 1), t), "isteklo");
  for (const z of [null, "", "abc", "123", String(t + 1000), `${t}.x`]) assert.equal(await provjeriZig(z, t), "nevaljao", String(z));
});

test("vremenski žig sa secretom PRISTUP_TAJNA: HMAC potpis, krivotvoren ili goli ms nevaljao", async () => {
  env.PRISTUP_TAJNA = "tajna-za-test";
  const t = SADA.getTime();
  const zig = await vremenskiZig(t - 10_000);
  assert.match(zig, /^\d{13}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(await provjeriZig(zig, t), "valja");
  assert.equal(await provjeriZig(String(t - 10_000), t), "nevaljao");
  const [ms, potpis] = zig.split(".");
  assert.equal(await provjeriZig(`${Number(ms) - 1000}.${potpis}`, t), "nevaljao", "potpis ne vrijedi za drugo vrijeme");
  env.PRISTUP_TAJNA = "druga";
  assert.equal(await provjeriZig(zig, t), "nevaljao");
});

test("ipHash: sha-256 hex bez sirovog IP-a, stabilan, ovisi o secretu; bez IP-a null", async () => {
  const h = await ipHash(IP);
  assert.match(h!, /^[0-9a-f]{64}$/);
  assert.ok(!h!.includes("203"));
  assert.equal(await ipHash(` ${IP} `), h);
  assert.notEqual(await ipHash("203.0.113.8"), h);
  assert.equal(await ipHash(null), null);
  assert.equal(await ipHash(""), null);
  env.PRISTUP_TAJNA = "x";
  assert.notEqual(await ipHash(IP), h);
});

test("istiOrigin: samo točno isti origin", () => {
  const r = (o?: string) => new Request("https://logomedo.com/pristup", { method: "POST", headers: o ? { origin: o } : {} });
  assert.equal(istiOrigin(r("https://logomedo.com"), "https://logomedo.com"), true);
  assert.equal(istiOrigin(r("https://primjer.example"), "https://logomedo.com"), false);
  assert.equal(istiOrigin(r("null"), "https://logomedo.com"), false);
  assert.equal(istiOrigin(r(), "https://logomedo.com"), false);
});

test("posalji: ispravan obrazac upiše redak (e-mail malim slovima, ip_hash, privola_at), bez sirovog IP-a", async () => {
  const r = await posalji(obrazac({ email: " Ana@Vrtic.Example.TEST ", poruka: "Radim s predškolcima." }), IP, SADA);
  assert.deepEqual(r, { vrsta: "hvala" });
  const [z] = await redovi();
  assert.equal(z.email, "ana@vrtic.example.test");
  assert.equal(z.ime, "Ana Anić");
  assert.equal(z.ustanova, "Vrtić Sunce");
  assert.equal(z.grad, "Zagreb");
  assert.equal(z.poruka, "Radim s predškolcima.");
  assert.equal(z.status, "novi");
  assert.equal(z.privola_at, SADA.toISOString());
  assert.equal(z.created_at, SADA.toISOString());
  assert.equal(z.ip_hash, await ipHash(IP));
  assert.equal(z.obradio, null);
  assert.ok(!JSON.stringify(await redovi()).includes(IP));
  await posalji(obrazac({ email: "b@primjer.test" }), IP, SADA);
  assert.equal((await redovi())[1].poruka, null, "prazna poruka je NULL");
});

test("posalji: popunjen honeypot → isti „hvala”, ništa se ne upisuje", async () => {
  assert.deepEqual(await posalji(obrazac({ [HONEYPOT]: "https://spam.example" }), IP, SADA), { vrsta: "hvala" });
  assert.deepEqual(await posalji(obrazac({ [HONEYPOT]: "x", ime: "" }), IP, SADA), { vrsta: "hvala" }, "honeypot i prije provjere polja");
  assert.equal((await redovi()).length, 0);
});

test("posalji: prebrz ili nevaljao žig → tiho „hvala” bez upisa; istekao → 400 s porukom i novim žigom", async () => {
  const t = SADA.getTime();
  assert.deepEqual(await posalji(obrazac({ [ZIG]: String(t - 1000) }), IP, SADA), { vrsta: "hvala" });
  assert.deepEqual(await posalji(obrazac({ [ZIG]: null }), IP, SADA), { vrsta: "hvala" });
  assert.deepEqual(await posalji(obrazac({ [ZIG]: "smece" }), IP, SADA), { vrsta: "hvala" });
  assert.equal((await redovi()).length, 0);
  const r = await posalji(obrazac({ [ZIG]: String(t - 25 * 3600_000) }), IP, SADA);
  assert.equal(r.vrsta, "greske");
  if (r.vrsta !== "greske") return;
  assert.ok(r.greske.obrazac);
  assert.equal(r.unos.ime, "Ana Anić", "uneseno ostaje");
  assert.equal(await provjeriZig(r.zig, t), "valja", "novi žig se može odmah poslati");
  assert.equal((await redovi()).length, 0);
});

test("posalji: nedostaju polja ili nevaljao e-mail → greške s unesenim vrijednostima (i bez žiga), bez honeypota, bez upisa", async () => {
  const r = await posalji(obrazac({ email: "krivo", grad: "" }), IP, SADA);
  assert.equal(r.vrsta, "greske");
  if (r.vrsta !== "greske") return;
  assert.deepEqual(Object.keys(r.greske).sort(), ["email", "grad"]);
  assert.equal(r.unos.email, "krivo");
  assert.equal(r.unos.ime, "Ana Anić");
  assert.ok(!(HONEYPOT in r.unos));
  assert.equal(r.zig, String(SADA.getTime() - 10_000), "dobar žig se zadržava, pa ispravak nije „prebrz”");
  const prazan = await posalji(new FormData(), IP, SADA);
  assert.equal(prazan.vrsta, "greske", "prazan POST je 400, ne tihi „hvala”");
  if (prazan.vrsta === "greske") assert.equal(await provjeriZig(prazan.zig, SADA.getTime() + 3000), "valja");
  assert.equal((await redovi()).length, 0);
});

test("posalji: duplikat e-maila s otvorenim zahtjevom → isti „hvala”, bez novog retka; nakon obrade opet može", async () => {
  await posalji(obrazac(), IP, SADA);
  assert.deepEqual(await posalji(obrazac({ email: "ANA@vrtic.example.test", ime: "Drugo Ime" }), "198.51.100.1", SADA), { vrsta: "hvala" });
  assert.equal((await redovi()).length, 1);
  assert.equal((await redovi())[0].ime, "Ana Anić");
  await db().prepare("UPDATE zahtjevi_pristupa SET status = 'odbijen'").run();
  await posalji(obrazac(), "198.51.100.1", SADA);
  assert.equal((await redovi()).length, 2);
});

test("posalji: limit 3 na sat po IP-u, četvrti 429; druga adresa i nakon sata prolaze", async () => {
  for (let i = 0; i < LIMIT_PO_SATU; i++) {
    assert.deepEqual(await posalji(obrazac({ email: `l${i}@primjer.test` }), IP, SADA), { vrsta: "hvala" });
  }
  assert.deepEqual(await posalji(obrazac({ email: "l9@primjer.test" }), IP, SADA), { vrsta: "previse" });
  assert.equal((await redovi()).length, 3);
  assert.deepEqual(await posalji(obrazac({ email: "l9@primjer.test" }), "198.51.100.1", SADA), { vrsta: "hvala" });
  const kasnije = new Date(SADA.getTime() + 3600_000 + 1);
  assert.deepEqual(await posalji(obrazac({ email: "l10@primjer.test" }, kasnije), IP, kasnije), { vrsta: "hvala" });
  assert.equal((await redovi()).length, 5);
});

test("retencija: novi i odbijeni stariji od 6 mjeseci, odobreni nakon 6 mjeseci ili iskorištene pozivnice; ip_hash nakon 24 h", async () => {
  const ubaci = (email: string, status: string, created: string, obradjen: string | null, hash: string | null, ip: string | null) =>
    db().prepare(
      `INSERT INTO zahtjevi_pristupa (ime, email, privola_at, created_at, status, obradjen_at, poziv_token_hash, ip_hash)
       VALUES ('X', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(email, created, created, status, obradjen, hash, ip).run();
  await ubaci("stari-novi@primjer.test", "novi", "2026-05-18T00:00:00.000Z", null, null, null);
  await ubaci("svjezi-novi@primjer.test", "novi", "2026-05-20T00:00:00.000Z", null, null, "h1");
  await ubaci("stari-odbijen@primjer.test", "odbijen", "2026-05-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z", null, null);
  await ubaci("stari-odobren@primjer.test", "odobren", "2026-04-01T00:00:00.000Z", "2026-05-18T00:00:00.000Z", "t1", null);
  await ubaci("odobren-ceka@primjer.test", "odobren", "2026-11-01T00:00:00.000Z", "2026-11-02T00:00:00.000Z", "t2", null);
  await ubaci("odobren-iskoristen@primjer.test", "odobren", "2026-11-01T00:00:00.000Z", "2026-11-02T00:00:00.000Z", "t3", null);
  await ubaci("danas@primjer.test", "novi", "2026-11-19T11:00:00.000Z", null, null, "h2");
  for (const [h, iskoristena] of [["t2", null], ["t3", "2026-11-03T00:00:00.000Z"]]) {
    await db().prepare("INSERT INTO pozivi (token_hash, email, stvorio, created_at, istjece, iskoristena_at) VALUES (?, 'p@primjer.test', 's', 'x', 'y', ?)")
      .bind(h, iskoristena).run();
  }
  await pocisti(SADA);
  const ostali = (await redovi()).map((r) => [r.email, r.ip_hash]);
  assert.deepEqual(ostali, [
    ["svjezi-novi@primjer.test", null],
    ["odobren-ceka@primjer.test", null],
    ["danas@primjer.test", "h2"],
  ]);
});

test("retencija se radi i pri upisu novog zahtjeva", async () => {
  await db().prepare("INSERT INTO zahtjevi_pristupa (ime, email, privola_at, created_at) VALUES ('X', 'star@primjer.test', 't', '2026-01-01T00:00:00.000Z')").run();
  await posalji(obrazac(), IP, SADA);
  assert.deepEqual((await redovi()).map((r) => r.email), ["ana@vrtic.example.test"]);
});

test("posalji: upisan zahtjev šalje obavijest superadminu, odbačen (otvoreni već postoji) ne", async () => {
  env.RESEND_API_KEY = "re_test";
  const poslano: Record<string, unknown>[] = [];
  const f = (async (_url: string, init?: RequestInit) => {
    poslano.push(JSON.parse(String(init?.body)));
    return Response.json({ id: "ob_1" });
  }) as unknown as typeof fetch;
  try {
    assert.deepEqual(await posalji(obrazac(), IP, SADA, f), { vrsta: "hvala" });
    assert.equal(poslano.length, 1);
    assert.equal(poslano[0].subject, "Novi zahtjev za pristup LogoMedu");
    assert.deepEqual(poslano[0].to, ["sa@primjer.test"]);
    assert.ok(!JSON.stringify(poslano[0]).includes("ana@vrtic"), "bez adrese podnositelja");
    // Isti e-mail s otvorenim zahtjevom: ništa se ne upisuje, pa ni obavijest.
    await posalji(obrazac(), IP, new Date(SADA.getTime() + 2 * 3600_000), f);
    assert.equal(poslano.length, 1);
  } finally {
    delete env.RESEND_API_KEY;
  }
});
