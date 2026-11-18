// /admin/postavke, profil: ime za sve, e-mail samo logoped, preimenovanje u svim tablicama.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "../test/d1.ts";
import { env } from "../test/cloudflare-workers.ts";
import { createSession, getSession, SESSION_COOKIE } from "./sesija.ts";
import { profil, spremiProfil } from "./profil.ts";

const SA = "a@primjer.hr";
const ANA = "ana@primjer.hr";
const NOVI = "ana.horvat@primjer.hr";

beforeEach(() => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
});
const db = () => env.DB as D1Database;
const logoped = async (email = ANA) => (await db().prepare(
  "INSERT INTO korisnici (email, ime, uloga, aktivan) VALUES (?, 'Ana', 'logoped', 1) RETURNING id").bind(email).first<number>("id"))!;

test("logoped mijenja ime i e-mail: sesija, passkey i autorstvo idu za njim", async () => {
  await logoped();
  const token = await createSession(ANA, "passkey", null);
  await db().prepare("INSERT INTO admin_passkeys (id, email, public_key, label, created_at) VALUES ('k1', ?, 'x', 'iPhone', '2026-11-01')").bind(ANA).run();
  await db().prepare("INSERT INTO aktivnost (tko, radnja, tablica, grupa) VALUES (?, 'rijec.dodana', 'rijeci', 'g')").bind(ANA).run();

  const r = await spremiProfil({ email: ANA, uloga: "logoped" }, { ime: "  Ana   Horvat ", email: " Ana.Horvat@Primjer.hr " });
  assert.deepEqual(r, { ok: true, email: NOVI });
  assert.deepEqual(await profil(NOVI), { ime: "Ana Horvat", email: NOVI });

  const sesija = await getSession(`${SESSION_COOKIE}=${token}`);
  assert.equal(sesija?.email, NOVI);
  assert.equal(sesija?.uloga, "logoped");
  assert.equal(await db().prepare("SELECT email FROM admin_passkeys WHERE id = 'k1'").first("email"), NOVI);
  const tko = (await db().prepare("SELECT tko, radnja FROM aktivnost ORDER BY id").all<{ tko: string; radnja: string }>()).results;
  assert.deepEqual(tko.map((t) => t.tko), [NOVI, NOVI]);
  assert.equal(tko.at(-1)?.radnja, "korisnik.profil");
});

test("e-mail: neispravan, superadminov, tuđi ili s otvorenom pozivnicom se odbija", async () => {
  await logoped();
  await logoped("b@primjer.hr");
  const s = { email: ANA, uloga: "logoped" as const };
  assert.equal((await spremiProfil(s, { ime: "", email: "nije-email" })).ok, false);
  assert.equal((await spremiProfil(s, { ime: "", email: SA })).ok, false);
  assert.equal((await spremiProfil(s, { ime: "", email: "B@primjer.hr" })).ok, false);
  await db().prepare(`INSERT INTO pozivi (token_hash, email, stvorio, created_at, istjece) VALUES ('h', 'c@primjer.hr', ?, '2026-01-01', '2999-01-01')`).bind(SA).run();
  assert.equal((await spremiProfil(s, { ime: "", email: "c@primjer.hr" })).ok, false);
  assert.equal(await db().prepare("SELECT COUNT(*) AS n FROM korisnici WHERE email = ?").bind(ANA).first("n"), 1);
});

test("superadmin mijenja ime (redak nastane), e-mail ne", async () => {
  const s = { email: SA, uloga: "superadmin" as const };
  assert.equal((await spremiProfil(s, { ime: "Matija", email: "drugi@primjer.hr" })).ok, false);
  assert.deepEqual(await spremiProfil(s, { ime: "Matija", email: null }), { ok: true, email: SA });
  assert.deepEqual(await profil(SA), { ime: "Matija", email: SA });
});

test("ime dulje od 80 znakova se odbija", async () => {
  await logoped();
  assert.equal((await spremiProfil({ email: ANA, uloga: "logoped" }, { ime: "x".repeat(81), email: ANA })).ok, false);
});
