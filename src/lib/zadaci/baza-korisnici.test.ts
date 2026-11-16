// korisnikId i postaviLogopedskiMod: redak 'admin' nastaje samo za ADMIN_EMAILS (docs/rbac/, odluka 2).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "../test/d1.ts";
import { env } from "../test/cloudflare-workers.ts";
import { korisnikId, logopedskiMod, postaviLogopedskiMod } from "./baza.ts";

const SA = "a@primjer.hr";
const LOGOPED = "logoped@primjer.hr";

beforeEach(() => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
});

const db = () => env.DB as D1Database;
const redak = (email: string) =>
  db().prepare("SELECT id, uloga, aktivan, logopedski_mod FROM korisnici WHERE email = ?").bind(email)
    .first<{ id: number; uloga: string; aktivan: number; logopedski_mod: number }>();
const brojRedaka = () => db().prepare("SELECT count(*) AS n FROM korisnici").first<number>("n");

test("korisnikId: superadmin dobiva redak 'admin', drugi poziv isti id", async () => {
  const id = await korisnikId(SA);
  assert.deepEqual(await redak(SA), { id, uloga: "admin", aktivan: 1, logopedski_mod: 1 });
  assert.equal(await korisnikId(SA), id);
  assert.equal(await korisnikId("A@Primjer.HR"), id);
  assert.equal(await brojRedaka(), 1);
});

test("korisnikId: superadmin s postojećim retkom 'logoped' zadržava id i ulogu retka", async () => {
  const id = await db().prepare("INSERT INTO korisnici (email, uloga) VALUES (?, 'logoped') RETURNING id").bind(SA).first<number>("id");
  assert.equal(await korisnikId(SA), id);
  assert.equal((await redak(SA))?.uloga, "logoped");
});

test("korisnikId: aktivni logoped vraća svoj id i ne mijenja ulogu", async () => {
  const id = await db().prepare("INSERT INTO korisnici (email, uloga) VALUES (?, 'logoped') RETURNING id").bind(LOGOPED).first<number>("id");
  assert.equal(await korisnikId(LOGOPED), id);
  assert.equal(await korisnikId("Logoped@Primjer.hr"), id);
  assert.equal((await redak(LOGOPED))?.uloga, "logoped");
  assert.equal(await brojRedaka(), 1);
});

test("korisnikId: nepoznat e-mail izvan ADMIN_EMAILS baca i ne stvara redak", async () => {
  await assert.rejects(korisnikId("nepoznat@primjer.hr"), /pozivnic/);
  assert.equal(await brojRedaka(), 0);
  env.ADMIN_EMAILS = "";
  await assert.rejects(korisnikId(SA));
  assert.equal(await brojRedaka(), 0);
});

test("postaviLogopedskiMod: nepoznat e-mail ne stvara redak", async () => {
  await postaviLogopedskiMod("nepoznat@primjer.hr", false);
  assert.equal(await brojRedaka(), 0);
  assert.equal(await logopedskiMod("nepoznat@primjer.hr"), true);
});

test("postaviLogopedskiMod: superadmin stvara redak 'admin', pa ga mijenja", async () => {
  await postaviLogopedskiMod(SA, false);
  assert.deepEqual(await redak(SA), { id: 1, uloga: "admin", aktivan: 1, logopedski_mod: 0 });
  assert.equal(await logopedskiMod(SA), false);
  await postaviLogopedskiMod(SA, true);
  assert.equal((await redak(SA))?.logopedski_mod, 1);
  assert.equal(await brojRedaka(), 1);
});

test("postaviLogopedskiMod: postojeći logoped mijenja samo svoj redak", async () => {
  await db().prepare("INSERT INTO korisnici (email, uloga) VALUES (?, 'logoped')").bind(LOGOPED).run();
  await postaviLogopedskiMod(LOGOPED, false);
  assert.deepEqual(await redak(LOGOPED), { id: 1, uloga: "logoped", aktivan: 1, logopedski_mod: 0 });
});
