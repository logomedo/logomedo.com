// Revizija prije alfe (docs/rbac/2026-11-18-revizija-logoped-alfa.md): logoped ne mijenja zajednički
// katalog mimo superadmina i ne vidi tuđe e-mailove. Superadmin se ne mijenja.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import { odluci, promijeniStil } from "./generiranje.ts";
import { brojKandidata, kandidati, nedavneOdluke } from "./pregled.ts";
import { odobriZvuk, ponoviZvuk } from "./zvukovi.ts";
import { zabranaNoveRijeci } from "./nepozeljne.ts";
import { rutaSamoSuperadmin, SAMO_SUPERADMIN } from "./admin/rute.ts";
import { ZADANI_LIMIT } from "./admin/ovlasti.ts";

const SA = "a@primjer.hr";
const ANA = "ana@primjer.hr";
const BORIS = "boris@primjer.hr";

const db = () => env.DB as D1Database;
let rijec = 0;
const javno = new Set<string>();

beforeEach(async () => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
  javno.clear();
  env.JAVNO = { head: async (k: string) => (javno.has(k) ? {} : null), put: async (k: string) => { javno.add(k); }, delete: async (k: string) => { javno.delete(k); } };
  env.SLIKE = { get: async () => ({ body: new ArrayBuffer(1), arrayBuffer: async () => new ArrayBuffer(1) }) };
  for (const e of [ANA, BORIS]) await db().prepare("INSERT INTO korisnici (email, uloga, aktivan) VALUES (?, 'logoped', 1)").bind(e).run();
  await db().prepare("INSERT OR IGNORE INTO stilovi (kod, naziv, predlozak) VALUES ('bojanka', 'Bojanka', 'p')").run();
  rijec = (await db().prepare("INSERT INTO rijeci (rijec, slug) VALUES ('mama', 'mama') RETURNING id").first<number>("id"))!;
});

async function slika(tko: string, n: number): Promise<number> {
  const stil = (await db().prepare("SELECT id FROM stilovi WHERE kod = 'ilustracija'").first<number>("id"))!;
  const id = (await db().prepare(
    `INSERT INTO slike (rijec_id, stil_id, r2_kljuc, sha256, mime, bajtova, izvor) VALUES (?, ?, ?, 'h', 'image/png', 1, 'agy') RETURNING id`,
  ).bind(rijec, stil, `ilustracija/mama/${n}.png`).first<number>("id"))!;
  await db().prepare("INSERT INTO generiranja (rijec_id, stil_id, prompt, zatrazio, status, slika_id) VALUES (?, ?, 'p', ?, 'gotovo', ?)")
    .bind(rijec, stil, tko, id).run();
  return id;
}

const stanje = (id: number) => db().prepare("SELECT status, predlozio, pregledao FROM slike WHERE id = ?").bind(id)
  .first<{ status: string; predlozio: string | null; pregledao: string | null }>();

test("slika: logopedovo „Odobri” je prijedlog, superadmin ga potvrđuje", async () => {
  const a = await slika(ANA, 1);
  assert.deepEqual(await odluci(a, "odobri", ANA), { ok: true, predlozena: true });
  assert.deepEqual(await stanje(a), { status: "kandidat", predlozio: ANA, pregledao: null });
  assert.equal(javno.size, 0, "predložena nije na CDN-u");

  // Logoped je više nema na pregledu; superadmin je ima, prvu, s oznakom tko predlaže.
  assert.deepEqual(await kandidati(null, ANA, true), []);
  assert.equal(await brojKandidata(ANA, true), 0);
  const b = await slika(BORIS, 2);
  assert.deepEqual((await kandidati(null, null)).map((k) => [k.id, k.predlozio]), [[a, ANA], [b, null]]);

  assert.deepEqual(await odluci(a, "odobri", SA), { ok: true });
  assert.equal((await stanje(a))?.status, "odobrena");
  assert.equal(javno.size, 1);
});

test("slika: logoped povlači svoj prijedlog i svoju odluku, superadminovu ne", async () => {
  const a = await slika(ANA, 1);
  await odluci(a, "odobri", ANA);
  assert.deepEqual(await odluci(a, "vrati", ANA), { ok: true });
  assert.equal((await stanje(a))?.predlozio, null);

  // Superadmin odbije: logoped je ne može vratiti u kandidate (pa sam odobriti).
  await odluci(a, "odbij", SA, "krivo");
  assert.deepEqual(await odluci(a, "vrati", ANA), { ok: false, zabranjeno: true });
  assert.equal((await stanje(a))?.status, "odbijena");

  // Superadmin odobri: logoped je ne miče iz odobrenih ni ne seli u drugi stil.
  const b = await slika(ANA, 2);
  await odluci(b, "odobri", SA);
  assert.deepEqual(await odluci(b, "vrati", ANA), { ok: false, zabranjeno: true });
  assert.equal((await promijeniStil(b, "bojanka", ANA)).ok, false);
  assert.equal((await promijeniStil(b, "bojanka", SA)).ok, true);

  // Svoju odluku (odbijena) logoped smije vratiti.
  const c = await slika(ANA, 3);
  await odluci(c, "odbij", ANA, "ne valja");
  assert.equal((await promijeniStil(c, "bojanka", ANA)).ok, true);
  assert.deepEqual(await odluci(c, "vrati", ANA), { ok: true });
  assert.equal((await stanje(c))?.status, "kandidat");
});

test("nedavne odluke: logoped samo o svojim slikama i bez tuđeg e-maila", async () => {
  const a = await slika(ANA, 1);
  const b = await slika(BORIS, 2);
  const c = await slika(ANA, 3);
  await odluci(a, "odbij", SA, "krivo");
  await odluci(b, "odbij", SA, "krivo");
  await odluci(c, "odbij", ANA, "krivo");
  const ana = await nedavneOdluke(ANA, true);
  assert.deepEqual(ana.map((o) => [o.id, o.pregledao]).sort(), [[a, null], [c, ANA]]);
  assert.equal((await nedavneOdluke()).length, 3, "superadmin vidi sve");
  assert.ok((await nedavneOdluke()).every((o) => o.pregledao));
});

async function zvuk(tko: string, kljuc: string, status = "kandidat"): Promise<number> {
  const posao = (await db().prepare("INSERT INTO zvuk_generiranja (kljuc, izgovor, status, zatrazio) VALUES (?, ?, 'gotovo', ?) RETURNING id")
    .bind(kljuc, kljuc, tko).first<number>("id"))!;
  return (await db().prepare(
    `INSERT INTO zvukovi (kljuc, izgovor, r2_kljuc, bajtova, glas_id, model, provjera, posao_id, status) VALUES (?, ?, ?, 1, 'g', 'm', 'ok', ?, ?) RETURNING id`,
  ).bind(kljuc, kljuc, `zvuk/${kljuc}-${posao}.mp3`, posao, status).first<number>("id"))!;
}
const statusZvuka = (id: number) => db().prepare("SELECT status FROM zvukovi WHERE id = ?").bind(id).first<string>("status");

test("izgovor: logoped popunjava samo tekst bez odobrenog i ne odbija tuđe kandidate", async () => {
  const stari = await zvuk(SA, "mama", "odobren");
  const a = await zvuk(ANA, "mama");
  assert.equal(await odobriZvuk(a, ANA), false, "odobren izgovor ne zamjenjuje");
  assert.equal(await statusZvuka(stari), "odobren");
  assert.equal(await ponoviZvuk("mama", ANA), false, "ni ne snima ponovo tekst s odobrenim");

  const t = await zvuk(ANA, "tata");
  const tBoris = await zvuk(BORIS, "tata");
  assert.equal(await odobriZvuk(t, ANA), true);
  assert.equal(await statusZvuka(t), "odobren");
  assert.equal(await statusZvuka(tBoris), "kandidat", "Borisov kandidat ostaje njemu");

  // Superadmin i dalje zamjenjuje.
  assert.equal(await odobriZvuk(a, SA), true);
  assert.equal(await statusZvuka(stari), "odbijen");
});

test("nova riječ: nepoželjnu nitko, obrisanu vraća samo superadmin", async () => {
  await db().prepare("INSERT INTO nepozeljne_rijeci (rijec, razlog) VALUES ('pištolj', 'nije za djecu')").run();
  await db().prepare("INSERT INTO rijeci (rijec, slug, aktivna) VALUES ('kukac', 'kukac', 0)").run();
  assert.match((await zabranaNoveRijeci("Pištolj", SA))!, /nepoželjnih/);
  assert.match((await zabranaNoveRijeci("kukac", ANA))!, /samo superadmin/);
  assert.equal(await zabranaNoveRijeci("kukac", SA), null);
  assert.equal(await zabranaNoveRijeci("kiša", ANA), null);
});

test("rute samo za superadmina: svaki prefiks i ono ispod njega, i kodirano", () => {
  for (const r of SAMO_SUPERADMIN) {
    assert.ok(rutaSamoSuperadmin(r), r);
    assert.ok(rutaSamoSuperadmin(`${r}/1`), `${r}/1`);
    assert.ok(rutaSamoSuperadmin(r.toUpperCase().replace("/ADMIN", "/admin")), `${r} velikim slovima`);
    assert.ok(rutaSamoSuperadmin(r.replace(/\//g, "//")), `${r} s dvostrukim kosim crtama`);
  }
  assert.equal(rutaSamoSuperadmin("/admin/pregled"), false);
});

test("pozivnica: zadana kvota za alfu je niža od migracije", () => {
  assert.deepEqual(ZADANI_LIMIT, { slike: 20, zvukovi: 50 });
});
