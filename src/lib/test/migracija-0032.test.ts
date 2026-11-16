// Migracija 0032 nad podacima iz stanja do 0031: stari 'logoped' se gasi, 'admin' ostaje.
import { test } from "node:test";
import assert from "node:assert/strict";
import { migracije, napraviD1, procitajMigraciju } from "./d1.ts";

test("napraviD1({ doMigracije }) staje na zadanoj migraciji", async () => {
  const db = napraviD1({ doMigracije: "0031" });
  const stupci = (await db.prepare("PRAGMA table_info(korisnici)").all<{ name: string }>()).results.map((r) => r.name);
  assert.ok(!stupci.includes("aktivan"));
  assert.ok(migracije().includes("0031_zvuk_glas_biljeske.sql"));
  assert.equal(await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'pozivi'").first("n"), 0);
});

test("0032: stari logoped deaktiviran, admin aktivan, zadani limiti 50/200", async () => {
  const db = napraviD1({ doMigracije: "0031" });
  await db.prepare("INSERT INTO korisnici (email, uloga) VALUES ('logoped@primjer.hr', 'logoped'), ('a@primjer.hr', 'admin')").run();
  await db.exec(procitajMigraciju("0032_korisnici_uloge.sql"));
  const redovi = (await db.prepare(
    "SELECT email, uloga, aktivan, deaktiviran_at, limit_slike_7d, limit_zvukovi_7d FROM korisnici ORDER BY email",
  ).all<Record<string, unknown>>()).results;
  assert.equal(redovi.length, 2);
  const [admin, logoped] = redovi;
  assert.deepEqual(admin, { email: "a@primjer.hr", uloga: "admin", aktivan: 1, deaktiviran_at: null, limit_slike_7d: 50, limit_zvukovi_7d: 200 });
  assert.equal(logoped.uloga, "logoped");
  assert.equal(logoped.aktivan, 0);
  assert.notEqual(logoped.deaktiviran_at, null);
  assert.equal(logoped.limit_slike_7d, 50);
  assert.equal(logoped.limit_zvukovi_7d, 200);
  // Novi redak nakon migracije je aktivan (pozivnica ga tako stvara).
  assert.equal(await db.prepare("INSERT INTO korisnici (email) VALUES ('novi@primjer.hr') RETURNING aktivan").first("aktivan"), 1);
});
