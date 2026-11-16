// Sesija i uloga kroz harness (svježa D1 po testu): odluka 2 iz docs/rbac/.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "../test/d1.ts";
import { env } from "../test/cloudflare-workers.ts";
import { createSession, getSession, sha256Hex, ulogaZa, SESSION_COOKIE } from "./sesija.ts";

const SA = "a@primjer.hr";
const LOGOPED = "logoped@primjer.hr";

beforeEach(() => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
});

const db = () => env.DB as D1Database;
const kolacic = (token: string) => `${SESSION_COOKIE}=${token}`;

async function korisnik(email: string, uloga: "logoped" | "admin", aktivan = 1): Promise<number> {
  return (await db().prepare("INSERT INTO korisnici (email, uloga, aktivan) VALUES (?, ?, ?) RETURNING id")
    .bind(email, uloga, aktivan).first<number>("id"))!;
}

async function prijava(email: string, method: "passkey" | "access" | "poziv" = "passkey") {
  const token = await createSession(email, method, "test-ua");
  return { token, hash: await sha256Hex(token) };
}

const prije = (sekundi: number) => new Date(Date.now() - sekundi * 1000).toISOString();

test("superadmin bez retka u korisnici", async () => {
  const { token } = await prijava(SA);
  const s = await getSession(kolacic(token));
  assert.ok(s);
  assert.equal(s.email, SA);
  assert.equal(s.method, "passkey");
  assert.equal(s.uloga, "superadmin");
  assert.equal(s.korisnikId, null);
  assert.ok(Date.parse(s.expiresAt) - Date.now() > 11.9 * 3600 * 1000);
});

test("superadmin s retkom: korisnikId je id retka (i kad je redak 'logoped' neaktivan)", async () => {
  const id = await korisnik(SA, "logoped", 0);
  const { token } = await prijava(SA);
  const s = await getSession(kolacic(token));
  assert.equal(s?.uloga, "superadmin");
  assert.equal(s?.korisnikId, id);
});

test("superadmin: e-mail u sesiji velikim slovima još nalazi redak", async () => {
  const id = await korisnik(SA, "admin");
  const { token } = await prijava("A@Primjer.HR");
  const s = await getSession(kolacic(token));
  assert.equal(s?.uloga, "superadmin");
  assert.equal(s?.korisnikId, id);
});

test("aktivni logoped", async () => {
  const id = await korisnik(LOGOPED, "logoped");
  const { token } = await prijava(LOGOPED);
  const s = await getSession(kolacic(token));
  assert.equal(s?.uloga, "logoped");
  assert.equal(s?.korisnikId, id);
});

test("deaktivirani logoped nema sesiju", async () => {
  await korisnik(LOGOPED, "logoped", 0);
  const { token } = await prijava(LOGOPED);
  assert.equal(await getSession(kolacic(token)), null);
});

test("redak 'admin' izvan ADMIN_EMAILS nema sesiju", async () => {
  await korisnik("bivsi@primjer.hr", "admin");
  const { token } = await prijava("bivsi@primjer.hr");
  assert.equal(await getSession(kolacic(token)), null);
});

test("e-mail bez retka i izvan ADMIN_EMAILS nema sesiju", async () => {
  const { token } = await prijava("nepoznat@primjer.hr");
  assert.equal(await getSession(kolacic(token)), null);
});

test("istekla sesija", async () => {
  const { token, hash } = await prijava(SA);
  await db().prepare("UPDATE admin_sessions SET expires_at = ? WHERE token_hash = ?").bind(prije(1), hash).run();
  assert.equal(await getSession(kolacic(token)), null);
});

test("neaktivnost > 2 h gasi sesiju, < 2 h je produži", async () => {
  const { token, hash } = await prijava(SA);
  const postavi = (s: number) => db().prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?").bind(prije(s), hash).run();
  await postavi(3600);
  assert.equal((await getSession(kolacic(token)))?.uloga, "superadmin");
  const zadnji = await db().prepare("SELECT last_seen_at FROM admin_sessions WHERE token_hash = ?").bind(hash).first<string>("last_seen_at");
  assert.ok(Date.now() - Date.parse(zadnji!) < 60_000, "last_seen_at osvježen");
  await postavi(2 * 3600 + 60);
  assert.equal(await getSession(kolacic(token)), null);
});

test("deaktivacija nakon prijave gasi postojeću sesiju logopeda", async () => {
  await korisnik(LOGOPED, "logoped");
  const { token } = await prijava(LOGOPED);
  assert.equal((await getSession(kolacic(token)))?.uloga, "logoped");
  await db().prepare("UPDATE korisnici SET aktivan = 0, deaktiviran_at = datetime('now') WHERE email = ?").bind(LOGOPED).run();
  assert.equal(await getSession(kolacic(token)), null);
});

test("micanje iz ADMIN_EMAILS gasi sesiju superadmina (i s retkom 'admin')", async () => {
  await korisnik(SA, "admin");
  const { token } = await prijava(SA);
  assert.equal((await getSession(kolacic(token)))?.uloga, "superadmin");
  env.ADMIN_EMAILS = "drugi@primjer.hr";
  assert.equal(await getSession(kolacic(token)), null);
  env.ADMIN_EMAILS = "";
  assert.equal(await getSession(kolacic(token)), null);
});

test("method 'poziv' se vraća", async () => {
  await korisnik(LOGOPED, "logoped");
  const { token } = await prijava(LOGOPED, "poziv");
  assert.equal((await getSession(kolacic(token)))?.method, "poziv");
});

test("nevažeći, nepostojeći ili tuđi kolačić", async () => {
  await prijava(SA);
  assert.equal(await getSession(null), null);
  assert.equal(await getSession(""), null);
  assert.equal(await getSession("drugi=x"), null);
  assert.equal(await getSession(kolacic("nepostojeci-token")), null);
  assert.equal(await getSession(`${SESSION_COOKIE}=`), null);
});

test("ulogaZa: glavne grane", async () => {
  assert.deepEqual(await ulogaZa(SA), { uloga: "superadmin", korisnikId: null });
  assert.deepEqual(await ulogaZa("  A@PRIMJER.hr "), { uloga: "superadmin", korisnikId: null });
  const said = await korisnik(SA, "logoped", 0);
  assert.deepEqual(await ulogaZa(SA), { uloga: "superadmin", korisnikId: said });

  const lid = await korisnik(LOGOPED, "logoped");
  assert.deepEqual(await ulogaZa(LOGOPED), { uloga: "logoped", korisnikId: lid });
  assert.deepEqual(await ulogaZa("Logoped@Primjer.hr"), { uloga: "logoped", korisnikId: lid });
  await db().prepare("UPDATE korisnici SET aktivan = 0 WHERE id = ?").bind(lid).run();
  assert.equal(await ulogaZa(LOGOPED), null);

  await korisnik("bivsi@primjer.hr", "admin");
  assert.equal(await ulogaZa("bivsi@primjer.hr"), null);
  assert.equal(await ulogaZa("nepoznat@primjer.hr"), null);

  env.ADMIN_EMAILS = "";
  assert.equal(await ulogaZa(SA), null);
});
