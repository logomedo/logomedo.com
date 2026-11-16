// Smoke test harnessa: migracije u node:sqlite, D1 podskup i šav za `cloudflare:workers`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { migracije, napraviD1 } from "./d1.ts";
import { env } from "./cloudflare-workers.ts";

const stupci = async (db: D1Database, tablica: string) =>
  (await db.prepare(`PRAGMA table_info(${tablica})`).all<{ name: string }>()).results.map((r) => r.name);

test("sve migracije se primijene, redom kao wrangler", async () => {
  const imena = migracije();
  assert.ok(imena.length >= 33);
  assert.ok(imena.indexOf("0030_okvir_zadatka.sql") < imena.indexOf("0030_zvuk_nacini_probe.sql"));
  assert.equal(imena.at(-1), "0032_korisnici_uloge.sql");
  const db = napraviD1();
  const t = await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").first<number>("n");
  assert.ok(t! > 10);
});

test("0032: stupci i tablice", async () => {
  const db = napraviD1();
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
