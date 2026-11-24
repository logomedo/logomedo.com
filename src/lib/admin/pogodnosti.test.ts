// Pogodnosti nakon bete (migrations/0045, docs/pogodnosti.md): izbori, dodjela po e-mailu, zamjena i uklanjanje
// čuvaju povijest, najviše jedna važeća po e-mailu, „Odobri” na zahtjevu upiše pogodnost tek uz izdanu pozivnicu.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "../test/d1.ts";
import { env } from "../test/cloudflare-workers.ts";
import { IZBORI, dodijeli, mjeseciTekst, opisPogodnosti, opozvane, procitajIzbor, vazeca, vazece } from "./pogodnosti.ts";
import { odobri } from "./zahtjevi.ts";

const SA = "sa@primjer.test";
const SADA = new Date("2026-11-24T12:00:00.000Z");
beforeEach(() => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
});
const db = () => env.DB as D1Database;

test("mjeseciTekst: hrvatska množina", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 11, 12, 21, 22, 24].map(mjeseciTekst),
    ["1 mjesec", "2 mjeseca", "3 mjeseca", "4 mjeseca", "5 mjeseci", "11 mjeseci", "12 mjeseci", "21 mjesec", "22 mjeseca", "24 mjeseca"]);
});

test("procitajIzbor: prazno = bez, m1…m36 i trajno, ostalo neispravno; svi IZBORI se čitaju", () => {
  assert.equal(procitajIzbor(""), null);
  assert.equal(procitajIzbor(null), null);
  assert.deepEqual(procitajIzbor("m3"), { vrsta: "mjeseci", mjeseci: 3 });
  assert.deepEqual(procitajIzbor("trajno"), { vrsta: "trajno", mjeseci: null });
  for (const v of ["m0", "m37", "m", "3", "zauvijek", "m3 ", 5]) assert.equal(procitajIzbor(v), undefined, String(v));
  for (const i of IZBORI) assert.notEqual(procitajIzbor(i.kod), undefined, i.kod);
  assert.equal(opisPogodnosti({ vrsta: "trajno", mjeseci: null }), "Trajno besplatno");
  assert.equal(opisPogodnosti({ vrsta: "mjeseci", mjeseci: 2 }), "2 mjeseca besplatno");
});

test("dodijeli: e-mail malim slovima, zamjena opozove staru, uklanjanje ostavi povijest", async () => {
  assert.deepEqual(await dodijeli("  Ana@Primjer.TEST ", { vrsta: "mjeseci", mjeseci: 3 }, " recenzentica ", SA, SADA), { ok: true, email: "ana@primjer.test" });
  const v = await vazeca("ANA@primjer.test");
  assert.equal(v?.vrsta, "mjeseci");
  assert.equal(v?.mjeseci, 3);
  assert.equal(v?.napomena, "recenzentica");
  assert.equal(v?.dodijelio, SA);

  await dodijeli("ana@primjer.test", { vrsta: "trajno", mjeseci: null }, "", SA, new Date("2026-11-25T00:00:00Z"));
  assert.equal((await vazeca("ana@primjer.test"))?.vrsta, "trajno");
  assert.equal((await vazece()).length, 1);
  const stara = await opozvane();
  assert.equal(stara.length, 1);
  assert.equal(stara[0].mjeseci, 3);
  assert.equal(stara[0].opozvao, SA);

  await dodijeli("ana@primjer.test", null, null, SA);
  assert.equal(await vazeca("ana@primjer.test"), null);
  assert.equal((await opozvane()).length, 2);
});

test("dodijeli: neispravan e-mail se odbije", async () => {
  assert.deepEqual(await dodijeli("nije-email", { vrsta: "trajno", mjeseci: null }, null, SA), { ok: false, greska: "Neispravan e-mail." });
});

test("baza: CHECK i najviše jedna važeća po e-mailu", async () => {
  const ins = (vrsta: string, mjeseci: number | null) => db().prepare(
    "INSERT INTO pogodnosti (email, vrsta, mjeseci, dodijelio, created_at) VALUES ('b@primjer.test', ?, ?, ?, ?)",
  ).bind(vrsta, mjeseci, SA, SADA.toISOString()).run();
  await assert.rejects(ins("trajno", 3));
  await assert.rejects(ins("mjeseci", null));
  await assert.rejects(ins("mjeseci", 40));
  await ins("mjeseci", 2);
  await assert.rejects(ins("trajno", null));
});

test("odobri s pogodnošću: upiše je za e-mail zahtjeva; bez pogodnosti ne dira postojeću", async () => {
  const zahtjev = async (email: string) => (await db().prepare(
    "INSERT INTO zahtjevi_pristupa (ime, email, privola_at, created_at) VALUES ('Ana', ?, ?, ?) RETURNING id",
  ).bind(email, SADA.toISOString(), SADA.toISOString()).first<number>("id"))!;
  const r = await odobri(await zahtjev("ana@primjer.test"), SA, SADA, { p: { vrsta: "mjeseci", mjeseci: 2 }, napomena: "rana" });
  assert.equal(r.ok, true);
  assert.equal((await vazeca("ana@primjer.test"))?.mjeseci, 2);

  await dodijeli("bo@primjer.test", { vrsta: "trajno", mjeseci: null }, null, SA);
  assert.equal((await odobri(await zahtjev("bo@primjer.test"), SA, SADA)).ok, true);
  assert.equal((await vazeca("bo@primjer.test"))?.vrsta, "trajno");
});

test("odobri koji ne izda pozivnicu ne upiše pogodnost (superadmin)", async () => {
  const id = (await db().prepare(
    "INSERT INTO zahtjevi_pristupa (ime, email, privola_at, created_at) VALUES ('S', ?, ?, ?) RETURNING id",
  ).bind(SA, SADA.toISOString(), SADA.toISOString()).first<number>("id"))!;
  assert.equal((await odobri(id, SA, SADA, { p: { vrsta: "trajno", mjeseci: null } })).ok, false);
  assert.equal(await vazeca(SA), null);
});
