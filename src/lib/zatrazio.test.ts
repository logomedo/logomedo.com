// Pregled po korisniku: logoped vidi i odlučuje samo o slikama i izgovorima koje je sam poslao,
// superadmin o svima i vidi tko je što poslao.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import { posiljateljiNaPregledu, smijeOSlici } from "./zatrazio.ts";
import { kandidati } from "./pregled.ts";
import { brojeviIzgovora, odbijZvukove, odobriZvuk, skupineIzgovora } from "./zvukovi.ts";
import { pregledFiltar } from "./admin/vlasnistvo.ts";

const SA = "a@primjer.hr";
const ANA = "ana@primjer.hr";
const BORIS = "boris@primjer.hr";

const db = () => env.DB as D1Database;
let rijec = 0;

beforeEach(async () => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
  for (const [e, ime] of [[ANA, "Ana Horvat"], [BORIS, null]] as const) {
    await db().prepare("INSERT INTO korisnici (email, ime, uloga, aktivan) VALUES (?, ?, 'logoped', 1)").bind(e, ime).run();
  }
  rijec = (await db().prepare("INSERT INTO rijeci (rijec, slug) VALUES ('mama', 'mama') RETURNING id").first<number>("id"))!;
});

async function slika(tko: string, n: number): Promise<number> {
  const stil = (await db().prepare("SELECT id FROM stilovi LIMIT 1").first<number>("id"))!;
  const id = (await db().prepare(
    `INSERT INTO slike (rijec_id, stil_id, r2_kljuc, sha256, mime, bajtova, izvor) VALUES (?, ?, ?, 'h', 'image/png', 1, 'agy') RETURNING id`,
  ).bind(rijec, stil, `ilustracija/mama/${n}.png`).first<number>("id"))!;
  await db().prepare("INSERT INTO generiranja (rijec_id, stil_id, prompt, zatrazio, status, slika_id) VALUES (?, ?, 'p', ?, 'gotovo', ?)")
    .bind(rijec, stil, tko, id).run();
  return id;
}

async function zvuk(tko: string, kljuc: string): Promise<number> {
  const posao = (await db().prepare("INSERT INTO zvuk_generiranja (kljuc, izgovor, status, zatrazio) VALUES (?, ?, 'gotovo', ?) RETURNING id")
    .bind(kljuc, kljuc, tko).first<number>("id"))!;
  return (await db().prepare(
    `INSERT INTO zvukovi (kljuc, izgovor, r2_kljuc, bajtova, glas_id, model, provjera, posao_id) VALUES (?, ?, ?, 1, 'g', 'm', 'ok', ?) RETURNING id`,
  ).bind(kljuc, kljuc, `zvuk/${kljuc}.mp3`, posao).first<number>("id"))!;
}

test("pregledFiltar: logoped uvijek svoje, superadmin sve ili odabranog", () => {
  assert.equal(pregledFiltar({ uloga: "logoped", email: "Ana@Primjer.hr" }, BORIS), ANA);
  assert.equal(pregledFiltar({ uloga: "superadmin", email: SA }), null);
  assert.equal(pregledFiltar({ uloga: "superadmin", email: SA }, " Boris@primjer.hr "), BORIS);
});

test("slike: logoped vidi i smije samo svoje; superadmin sve s pošiljateljem", async () => {
  const a = await slika(ANA, 1);
  const b = await slika(BORIS, 2);
  // Učitana slika: pošiljatelj iz dnevnika.
  const stil = (await db().prepare("SELECT id FROM stilovi LIMIT 1").first<number>("id"))!;
  const u = (await db().prepare(
    `INSERT INTO slike (rijec_id, stil_id, r2_kljuc, sha256, mime, bajtova, izvor) VALUES (?, ?, 'x/u.png', 'h', 'image/png', 1, 'upload') RETURNING id`,
  ).bind(rijec, stil).first<number>("id"))!;
  await db().prepare("INSERT INTO aktivnost (tko, radnja, tablica, redak_id, grupa) VALUES (?, 'slika.ucitana', 'slike', ?, 'g')").bind(BORIS, u).run();

  assert.deepEqual((await kandidati(null, ANA)).map((k) => k.id), [a]);
  const svi = await kandidati(null, null);
  assert.deepEqual(svi.map((k) => [k.id, k.zatrazio]), [[a, ANA], [b, BORIS], [u, BORIS]]);
  assert.equal(await smijeOSlici(a, ANA), true);
  assert.equal(await smijeOSlici(b, ANA), false);
  assert.equal(await smijeOSlici(u, ANA), false);
  assert.equal(await smijeOSlici(b, SA), true);

  const p = await posiljateljiNaPregledu();
  assert.deepEqual(p.map((x) => [x.ime, x.slike]), [["Ana Horvat", 1], [BORIS, 2]]);
});

test("izgovori: logoped vidi, broji i odlučuje samo o svojima", async () => {
  // R2 u memoriji: odobrenje kopira snimku u javni bucket.
  const javno = new Set<string>();
  env.JAVNO = { head: async (k: string) => (javno.has(k) ? {} : null), put: async (k: string) => { javno.add(k); }, delete: async () => {} };
  env.SLIKE = { get: async () => ({ body: new ArrayBuffer(1) }) };
  const a = await zvuk(ANA, "mama");
  const b = await zvuk(BORIS, "tata");
  assert.deepEqual((await skupineIzgovora("ceka", ANA)).map((g) => g.kljuc), ["mama"]);
  assert.equal((await brojeviIzgovora(ANA)).ceka, 1);
  assert.equal((await brojeviIzgovora(null)).ceka, 2);
  assert.equal((await skupineIzgovora("ceka", null)).find((g) => g.kljuc === "tata")?.snimke[0].zatrazio, BORIS);

  assert.equal(await odobriZvuk(b, ANA), false);
  assert.equal(await odbijZvukove([b], ANA, { ponovo: false }), 0);
  assert.equal(await db().prepare("SELECT status FROM zvukovi WHERE id = ?").bind(b).first("status"), "kandidat");
  assert.equal(await odobriZvuk(b, SA), true);
  assert.equal(await odbijZvukove([a], ANA, { ponovo: false }), 1);
});
