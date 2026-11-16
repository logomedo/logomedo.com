// /admin/korisnici: deaktivacija, aktivacija, limiti i popis (docs/rbac/, S2) na harnessu.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "../test/d1.ts";
import { env } from "../test/cloudflare-workers.ts";
import { createSession, getSession, SESSION_COOKIE } from "./sesija.ts";
import { LIMIT_MAX, popisKorisnika, postaviAktivan, postaviLimite, procitajLimit } from "./korisnici.ts";
import { izdaj, provjeri } from "./pozivi.ts";

const SA = "a@primjer.hr";
const LOGOPED = "b@primjer.hr";

beforeEach(() => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
});

const db = () => env.DB as D1Database;
async function korisnik(email: string, uloga: "logoped" | "admin", aktivan = 1): Promise<number> {
  return (await db().prepare("INSERT INTO korisnici (email, ime, uloga, aktivan) VALUES (?, 'Ana', ?, ?) RETURNING id")
    .bind(email, uloga, aktivan).first<number>("id"))!;
}
const red = (id: number) => db().prepare("SELECT aktivan, deaktiviran_at, limit_slike_7d, limit_zvukovi_7d FROM korisnici WHERE id = ?")
  .bind(id).first<{ aktivan: number; deaktiviran_at: string | null; limit_slike_7d: number; limit_zvukovi_7d: number }>();
const radnje = async () => (await db().prepare("SELECT tko, radnja, tablica FROM aktivnost ORDER BY id").all()).results;

test("procitajLimit: cijeli broj 0…LIMIT_MAX, inače null", () => {
  assert.equal(procitajLimit("0"), 0);
  assert.equal(procitajLimit(" 50 "), 50);
  assert.equal(procitajLimit(String(LIMIT_MAX)), LIMIT_MAX);
  for (const v of ["-1", "1.5", "1e3", "", "abc", String(LIMIT_MAX + 1), "9999999", null, undefined, 5]) {
    assert.equal(procitajLimit(v), null, String(v));
  }
});

test("deaktivacija: aktivan=0, sesije obrisane, otvorena pozivnica opozvana, zapis; aktivacija vraća", async () => {
  const id = await korisnik(LOGOPED, "logoped");
  const token = await createSession(LOGOPED, "poziv", null);
  const kolacic = `${SESSION_COOKIE}=${token}`;
  assert.equal((await getSession(kolacic))?.uloga, "logoped");
  // Otvorena pozivnica za novi passkey (izdaje se i aktivnom).
  const p = await izdaj({ email: LOGOPED, korisnikId: id }, SA);

  assert.deepEqual(await postaviAktivan(id, false, SA), { ok: true });
  const r = await red(id);
  assert.equal(r?.aktivan, 0);
  assert.ok(r?.deaktiviran_at);
  assert.equal(await db().prepare("SELECT COUNT(*) AS n FROM admin_sessions").first<number>("n"), 0);
  assert.equal(await getSession(kolacic), null);
  assert.equal(await provjeri(p.token), null, "stari link ne vraća pristup");

  assert.deepEqual(await postaviAktivan(id, true, SA), { ok: true });
  assert.deepEqual({ ...(await red(id)) }, { aktivan: 1, deaktiviran_at: null, limit_slike_7d: 50, limit_zvukovi_7d: 200 });
  assert.deepEqual((await radnje()).map((x) => x.radnja), ["poziv.izdan", "korisnik.deaktiviran", "poziv.opozvan", "korisnik.aktiviran"]);
});

test("deaktivacija već deaktiviranog ne ostavlja zapis", async () => {
  const id = await korisnik(LOGOPED, "logoped", 0);
  assert.deepEqual(await postaviAktivan(id, false, SA), { ok: true });
  assert.deepEqual(await radnje(), []);
});

test("superadmin (i s retkom) se ne deaktivira niti mu se mijenja limit; redak 'admin' se ne aktivira", async () => {
  const sa = await korisnik(SA, "admin");
  assert.equal((await postaviAktivan(sa, false, SA)).ok, false);
  assert.equal((await postaviLimite(sa, 1, 1, SA)).ok, false);
  assert.equal((await red(sa))?.aktivan, 1);
  const admin = await korisnik(LOGOPED, "admin", 0);
  assert.equal((await postaviAktivan(admin, true, SA)).ok, false);
  assert.equal((await postaviAktivan(999, false, SA)).ok, false);
  assert.deepEqual(await radnje(), []);
});

test("limiti: spremanje sa zapisom; neispravna vrijednost odbijena", async () => {
  const id = await korisnik(LOGOPED, "logoped");
  assert.deepEqual(await postaviLimite(id, 10, 0, SA), { ok: true });
  const r = await red(id);
  assert.equal(r?.limit_slike_7d, 10);
  assert.equal(r?.limit_zvukovi_7d, 0);
  assert.equal((await postaviLimite(id, null, 5, SA)).ok, false);
  assert.deepEqual(await radnje(), [{ tko: SA, radnja: "korisnik.limit", tablica: "korisnici" }]);
});

test("popis: superadmin bez retka, logoped s ključem i zadnjom prijavom, deaktivirani bez uloge", async () => {
  await korisnik(LOGOPED, "logoped");
  await korisnik("c@primjer.hr", "logoped", 0);
  await db().prepare("INSERT INTO admin_passkeys (id, email, public_key, label, created_at, last_used_at) VALUES ('k', ?, 'AAAA', 'x', '2026-11-01', '2026-11-02T08:00:00.000Z')")
    .bind(LOGOPED).run();
  await createSession(LOGOPED, "passkey", null);
  const p = await popisKorisnika();
  assert.deepEqual(p.map((k) => [k.email, k.uloga, k.kljuceva]), [[SA, "superadmin", 0], [LOGOPED, "logoped", 1], ["c@primjer.hr", null, 0]]);
  assert.equal(p[0].id, null);
  assert.ok(p[1].zadnja_prijava! > "2026-11-02T08:00:00.000Z", "sesija je novija od passkeya");
  assert.equal(p[2].zadnja_prijava, null);
});
