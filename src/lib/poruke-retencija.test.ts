// Retencija inboxa (odluka 400): istekli razgovor nestaje s porukama, privitcima (R2 i D1) i redom obavijesti;
// svjež ostaje; prazan razgovor stariji od dana se briše, svjež prazan (pozivnica u slanju) ne.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import { noviRazgovor, spremiDolaznu, type Dolazna } from "./poruke.ts";
import { pocistiPoruke } from "./poruke-retencija.ts";
import { PORUKE_ROK_MJESECI } from "./poruke-rokovi.ts";

let obrisani: string[] = [];
beforeEach(() => {
  env.DB = napraviD1();
  obrisani = [];
  env.SLIKE = { delete: async (k: string | string[]) => { obrisani.push(...(Array.isArray(k) ? k : [k])); } };
});
const db = () => env.DB as D1Database;
const broj = async (t: string) => (await db().prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())!.n;

let n = 0;
const dolazna = (od: string, createdAt: string, privitci = 0): Dolazna => ({
  resendId: `em_${++n}`, messageId: `<m${n}@primjer.test>`, inReplyTo: null, reference: [], od, za: ["bok@primjer.test"],
  predmet: "Pitanje", text: "Pozdrav", html: null, tijeloFali: false, createdAt,
  privitci: Array.from({ length: privitci }, (_, i) => ({ r2Kljuc: `poruke/em_${n}/a${i}`, ime: `p${i}.pdf`, tip: "application/pdf", velicina: 10 })),
});

const SADA = new Date("2028-12-01T12:00:00.000Z");

test("rok je 24 mjeseca (odluka 204, /privatnost)", () => assert.equal(PORUKE_ROK_MJESECI, 24));

test("istekli razgovor nestaje sa svime, svježi ostaje", async () => {
  const stari = await spremiDolaznu(dolazna("stari@primjer.test", "2026-11-30T12:00:00.000Z", 2));
  const svjez = await spremiDolaznu(dolazna("svjez@primjer.test", "2026-12-02T12:00:00.000Z", 1));
  assert.ok(stari.nova && svjez.nova);
  await db().prepare("INSERT INTO obavijesti (kljuc, poslano_at) VALUES (?, 'x'), (?, 'x'), ('zahtjevi', 'x')")
    .bind(`razgovor:${stari.razgovorId}`, `razgovor:${svjez.razgovorId}`).run();

  const r = await pocistiPoruke(SADA);
  assert.deepEqual(r, { razgovori: 1, r2: 2 });
  assert.deepEqual(obrisani.sort(), [`poruke/em_${n - 1}/a0`, `poruke/em_${n - 1}/a1`]);
  assert.equal(await broj("razgovori"), 1);
  assert.equal(await broj("poruke"), 1);
  assert.equal(await broj("privitci"), 1);
  const ob = (await db().prepare("SELECT kljuc FROM obavijesti ORDER BY kljuc").all<{ kljuc: string }>()).results.map((x) => x.kljuc);
  assert.deepEqual(ob, [`razgovor:${svjez.razgovorId}`, "zahtjevi"]);

  assert.deepEqual(await pocistiPoruke(SADA), { razgovori: 0, r2: 0 }, "drugi put nema ničega");
});

test("nova poruka produžuje rok cijelog razgovora", async () => {
  const a = await spremiDolaznu(dolazna("ana@primjer.test", "2026-01-01T12:00:00.000Z", 1));
  assert.ok(a.nova);
  const b = await spremiDolaznu(dolazna("ana@primjer.test", "2027-06-01T12:00:00.000Z"));
  assert.ok(b.nova && b.razgovorId === a.razgovorId);
  assert.deepEqual(await pocistiPoruke(SADA), { razgovori: 0, r2: 0 });
  assert.equal(await broj("poruke"), 2);
});

test("prazan razgovor: stariji od dana se briše, svjež ne", async () => {
  await noviRazgovor({ email: "stari@primjer.test", sada: "2028-11-29T12:00:00.000Z" });
  await noviRazgovor({ email: "svjez@primjer.test", sada: "2028-12-01T11:00:00.000Z" });
  assert.deepEqual(await pocistiPoruke(SADA), { razgovori: 1, r2: 0 });
  const ostao = await db().prepare("SELECT email FROM razgovori").first<{ email: string }>();
  assert.equal(ostao!.email, "svjez@primjer.test");
});

test("R2 padne: D1 ostaje netaknut", async () => {
  await spremiDolaznu(dolazna("stari@primjer.test", "2026-01-01T12:00:00.000Z", 1));
  env.SLIKE = { delete: async () => { throw new Error("r2"); } };
  await assert.rejects(pocistiPoruke(SADA));
  assert.equal(await broj("razgovori"), 1);
  assert.equal(await broj("privitci"), 1);
});
