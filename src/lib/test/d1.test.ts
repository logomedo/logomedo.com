// Smoke test harnessa: migracije u node:sqlite, D1 podskup i šav za `cloudflare:workers`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { migracije, napraviD1, procitajMigraciju } from "./d1.ts";
import { env } from "./cloudflare-workers.ts";

const stupci = async (db: D1Database, tablica: string) =>
  (await db.prepare(`PRAGMA table_info(${tablica})`).all<{ name: string }>()).results.map((r) => r.name);

test("sve migracije se primijene, redom kao wrangler", async () => {
  const imena = migracije();
  assert.ok(imena.length >= 33);
  assert.ok(imena.indexOf("0030_okvir_zadatka.sql") < imena.indexOf("0030_zvuk_nacini_probe.sql"));
  assert.equal(imena.at(-1), "0047_kuponi.sql");
  const db = napraviD1();
  const t = await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").first<number>("n");
  assert.ok(t! > 10);
});

test("0032: stupci i tablice", async () => {
  const db = napraviD1({ doMigracije: "0032" });
  const k = await stupci(db, "korisnici");
  for (const s of ["aktivan", "deaktiviran_at", "limit_slike_7d", "limit_zvukovi_7d", "logopedski_mod"]) assert.ok(k.includes(s), s);
  assert.deepEqual(await stupci(db, "pozivi"), [
    "token_hash", "email", "ime", "korisnik_id", "stvorio", "created_at", "istjece", "iskoristena_at", "opozvana_at",
  ]);
  assert.deepEqual(await stupci(db, "ai_potrosnja"), ["id", "korisnik_id", "vrsta", "kolicina", "at", "izvor"]);
  assert.ok((await stupci(db, "rijeci")).includes("dodao"));
  const red = await db.prepare("INSERT INTO korisnici (email) VALUES (?) RETURNING uloga, aktivan, limit_slike_7d, limit_zvukovi_7d")
    .bind("a@primjer.hr").first();
  assert.deepEqual(red, { uloga: "logoped", aktivan: 1, limit_slike_7d: 50, limit_zvukovi_7d: 200 });
  await assert.rejects(
    db.prepare("INSERT INTO ai_potrosnja (korisnik_id, vrsta, kolicina) VALUES (1, 'video', 1)").run(),
  );
});

test("0033: pozivi s id i passkey_id; aktivnost prepisana s istim podacima i novim tablicama", async () => {
  const db = napraviD1({ doMigracije: "0032" });
  await db.prepare("INSERT INTO pozivi (token_hash, email, stvorio, created_at, istjece) VALUES ('h', 'b@primjer.hr', 'a@primjer.hr', 'x', 'y')").run();
  await db.prepare("INSERT INTO aktivnost (tko, radnja, tablica, redak_id, grupa, prije, poslije) VALUES ('a', 'rijec.nova', 'rijeci', 7, 'g', NULL, '{}')").run();
  await db.prepare("INSERT INTO aktivnost (tko, radnja, tablica, redak_id, grupa, prije, poslije, vraca_id) VALUES ('a', 'slika.odobrena', 'slike', 3, 'g2', '{}', '{\"rijec_id\":7}', 1)").run();
  await assert.rejects(db.prepare("INSERT INTO aktivnost (tko, radnja, tablica, grupa) VALUES ('a', 'x', 'korisnici', 'g')").run());
  await db.exec(procitajMigraciju("0033_pozivi_aktivnost.sql"));
  assert.deepEqual(await stupci(db, "pozivi"), [
    "id", "token_hash", "email", "ime", "korisnik_id", "stvorio", "created_at", "istjece", "iskoristena_at", "passkey_id", "opozvana_at",
  ]);
  assert.deepEqual(await db.prepare("SELECT id, token_hash FROM pozivi").first(), { id: 1, token_hash: "h" });
  assert.deepEqual((await db.prepare("SELECT id, tablica, redak_id, vraca_id, rijec_id FROM aktivnost ORDER BY id").all()).results, [
    { id: 1, tablica: "rijeci", redak_id: 7, vraca_id: null, rijec_id: 7 },
    { id: 2, tablica: "slike", redak_id: 3, vraca_id: 1, rijec_id: 7 },
  ]);
  for (const t of ["korisnici", "pozivi"]) {
    await db.prepare("INSERT INTO aktivnost (tko, radnja, tablica, grupa, vraca_id) VALUES ('a', 'x', ?, 'g', 1)").bind(t).run();
  }
  await assert.rejects(db.prepare("INSERT INTO aktivnost (tko, radnja, tablica, grupa) VALUES ('a', 'x', 'nesto', 'g')").run());
  await assert.rejects(db.prepare("INSERT INTO aktivnost (tko, radnja, tablica, grupa, vraca_id) VALUES ('a', 'x', 'rijeci', 'g', 999)").run(), "strani ključ na sebe");
  const idx = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('aktivnost', 'pozivi') AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>()).results;
  assert.deepEqual(idx.map((i) => i.name), ["aktivnost_grupa", "aktivnost_redak", "aktivnost_rijec", "aktivnost_tko", "pozivi_email"]);
  assert.ok(!(await db.prepare("SELECT sql FROM sqlite_master WHERE name = 'aktivnost'").first<string>("sql"))!.includes("aktivnost_nova"));
});

test("RETURNING kroz first/all/run, meta, bind", async () => {
  const db = napraviD1();
  const id = await db.prepare("INSERT INTO korisnici (email) VALUES (?) RETURNING id").bind("a@primjer.hr").first<number>("id");
  assert.equal(typeof id, "number");
  const r = await db.prepare("UPDATE korisnici SET aktivan = ? WHERE id = ? RETURNING aktivan").bind(false, id).run();
  assert.deepEqual(r.results, [{ aktivan: 0 }]);
  assert.equal(r.meta.changes, 1);
  const ins = await db.prepare("INSERT INTO korisnici (email, ime) VALUES ('b@primjer.hr', ?)").bind(null).run();
  assert.equal(ins.meta.changes, 1);
  assert.ok(ins.meta.last_row_id > id!);
  const sve = await db.prepare("SELECT email FROM korisnici ORDER BY id").all<{ email: string }>();
  assert.deepEqual(sve.results.map((x) => x.email), ["a@primjer.hr", "b@primjer.hr"]);
  assert.deepEqual(await db.prepare("SELECT 1 AS a, 2 AS b").bind().raw({ columnNames: true }), [["a", "b"], [1, 2]]);
  assert.equal(await db.prepare("SELECT 1 AS a WHERE 0").first(), null);
  assert.throws(() => db.prepare("SELECT ?").bind(undefined), /undefined/);
});

test("batch je transakcija: greška vraća sve", async () => {
  const db = napraviD1();
  await assert.rejects(db.batch([
    db.prepare("INSERT INTO korisnici (email) VALUES (?)").bind("a@primjer.hr"),
    db.prepare("INSERT INTO korisnici (email) VALUES (?)").bind("a@primjer.hr"),
  ]));
  assert.equal(await db.prepare("SELECT count(*) AS n FROM korisnici").first("n"), 0);
  const rez = await db.batch([
    db.prepare("INSERT INTO korisnici (email) VALUES (?) RETURNING id").bind("a@primjer.hr"),
    db.prepare("SELECT count(*) AS n FROM korisnici"),
  ]);
  assert.deepEqual(rez[1].results, [{ n: 1 }]);
});

test("šav: produkcijski moduli čitaju env iz stuba", async () => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = "Sa@primjer.hr";
  const { ulogaZa } = await import("../admin/sesija.ts");
  const { korisnikId } = await import("../zadaci/baza.ts");
  assert.deepEqual(await ulogaZa("sa@primjer.hr"), { uloga: "superadmin", korisnikId: null });
  assert.equal(await ulogaZa("l@primjer.hr"), null);
  await assert.rejects(korisnikId("l@primjer.hr"));
  const id = await korisnikId("sa@primjer.hr");
  assert.deepEqual(await ulogaZa("sa@primjer.hr"), { uloga: "superadmin", korisnikId: id });
});

test("0034: zadaci zadržavaju okvir, vrsta razvrstavanje prolazi CHECK, područje pod predvještinama", async () => {
  const db = napraviD1();
  assert.ok((await stupci(db, "zadaci")).includes("okvir"));
  const p = await db.prepare("SELECT p.naziv, r.slug AS roditelj FROM podrucja p JOIN podrucja r ON r.id = p.roditelj_id WHERE p.slug = 'razvrstavanje'").first<{ naziv: string; roditelj: string }>();
  assert.deepEqual({ ...p }, { naziv: "Razvrstavanje", roditelj: "predvjestine" });
  const k = await db.prepare("INSERT INTO korisnici (email, uloga) VALUES ('t@t', 'admin') RETURNING id").first<number>("id");
  await db.prepare("INSERT INTO zadaci (autor_id, vrsta, okvir) VALUES (?, 'razvrstavanje', '{}')").bind(k).run();
  await assert.rejects(db.prepare("INSERT INTO zadaci (autor_id, vrsta) VALUES (?, 'nesto')").bind(k).run());
});

test("0035: slušne vrste prolaze CHECK, područja pod predvještinama", async () => {
  const db = napraviD1();
  const { results } = await db.prepare("SELECT p.slug FROM podrucja p JOIN podrucja r ON r.id = p.roditelj_id WHERE r.slug = 'predvjestine' AND p.slug IN ('glas-slovo', 'pozicija-glasa') ORDER BY p.slug").all<{ slug: string }>();
  assert.deepEqual(results.map((x) => x.slug), ["glas-slovo", "pozicija-glasa"]);
  const k = await db.prepare("INSERT INTO korisnici (email, uloga) VALUES ('t@t', 'admin') RETURNING id").first<number>("id");
  await db.prepare("INSERT INTO zadaci (autor_id, vrsta) VALUES (?, 'koje_slovo'), (?, 'pozicija_glasa')").bind(k, k).run();
});

test("0038: zahtjevi_pristupa, CHECK statusa i indeksi", async () => {
  const db = napraviD1();
  assert.deepEqual(await stupci(db, "zahtjevi_pristupa"), [
    "id", "ime", "email", "ustanova", "grad", "poruka", "privola_at", "created_at", "status", "obradio", "obradjen_at", "poziv_token_hash", "ip_hash", "paket", "broj_licenci", "kupon",
  ]);
  const ubaci = (status?: string) => db.prepare(
    `INSERT INTO zahtjevi_pristupa (ime, email, privola_at, created_at${status ? ", status" : ""}) VALUES ('A', 'a@primjer.test', 't', 't'${status ? ", ?" : ""}) RETURNING status`,
  ).bind(...(status ? [status] : []));
  assert.equal(await ubaci().first("status"), "novi");
  for (const s of ["odobren", "odbijen"]) assert.equal(await ubaci(s).first("status"), s);
  await assert.rejects(ubaci("nesto").run());
  await assert.rejects(db.prepare("INSERT INTO zahtjevi_pristupa (ime, email, created_at) VALUES ('A', 'a@primjer.test', 't')").run(), "privola_at je obavezna");
  const idx = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'zahtjevi_pristupa' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>()).results;
  assert.deepEqual(idx.map((i) => i.name), ["zahtjevi_pristupa_email", "zahtjevi_pristupa_ip", "zahtjevi_pristupa_status"]);
});
