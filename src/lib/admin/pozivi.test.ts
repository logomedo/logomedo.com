// Pozivnice na harnessu (svježa D1 po testu): odluke 2–5 i 105 iz docs/rbac/.
// WebAuthn se ne radi: `NoviPasskey` je ono što provjeriRegistraciju vrati nakon uspješne provjere.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "../test/d1.ts";
import { env } from "../test/cloudflare-workers.ts";
import { sha256Hex } from "./sesija.ts";
import {
  POZIV_SATI, PozivOdbijen, ispravanToken, iskoristi, izdaj, naredbeIskoristenja, opozovi, otvorenePozivnice, provjeri,
} from "./pozivi.ts";
import { vrati } from "../aktivnost.ts";
import type { NoviPasskey } from "./passkey.ts";

const SA = "a@primjer.hr";
const LOGOPED = "b@primjer.hr";

beforeEach(() => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
});

const db = () => env.DB as D1Database;
const kljuc = (id: string): NoviPasskey => ({ id, publicKey: "AAAA", counter: 0, transports: "internal", rpId: "logomedo.com" });
const za = (sati: number) => new Date(Date.now() + sati * 3600_000);

async function korisnik(email: string, uloga: "logoped" | "admin", aktivan: number, ime: string | null = null): Promise<number> {
  return (await db().prepare("INSERT INTO korisnici (email, ime, uloga, aktivan, deaktiviran_at) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(email, ime, uloga, aktivan, aktivan ? null : "2026-11-01T00:00:00.000Z").first<number>("id"))!;
}
const korisnici = async () => (await db().prepare("SELECT email, ime, uloga, aktivan, deaktiviran_at FROM korisnici ORDER BY id").all()).results;
const kljucevi = async () => (await db().prepare("SELECT id, email, label FROM admin_passkeys ORDER BY id").all()).results;
const zapisi = async () => (await db().prepare("SELECT tko, radnja, tablica, redak_id, prije, poslije FROM aktivnost ORDER BY id").all<{
  tko: string; radnja: string; tablica: string; redak_id: number; prije: string | null; poslije: string | null;
}>()).results;

async function odbijeno(p: Promise<unknown>, razlog: string) {
  await assert.rejects(p, (e) => e instanceof PozivOdbijen && e.razlog === razlog);
}

test("izdaj: token 32 B base64url, u bazi samo sha-256, 72 h, e-mail malim slovima, zapis bez tokena", async () => {
  const sada = new Date("2026-11-16T10:00:00.000Z");
  const { token, id, istjece } = await izdaj({ email: "  B@Primjer.HR ", ime: " Ana " }, SA, sada);
  assert.ok(ispravanToken(token));
  assert.equal(Buffer.from(token, "base64url").length, 32);
  assert.equal(istjece, "2026-11-19T10:00:00.000Z");
  assert.equal(POZIV_SATI, 72);
  const red = await db().prepare("SELECT * FROM pozivi WHERE id = ?").bind(id).first<Record<string, unknown>>();
  assert.equal(red?.token_hash, await sha256Hex(token));
  assert.equal(red?.email, LOGOPED);
  assert.equal(red?.ime, "Ana");
  assert.equal(red?.stvorio, SA);
  assert.equal(red?.korisnik_id, null);
  const z = await zapisi();
  assert.deepEqual(z.map((x) => [x.tko, x.radnja, x.tablica, x.redak_id]), [[SA, "poziv.izdan", "pozivi", id]]);
  const sve = JSON.stringify(await db().prepare("SELECT * FROM aktivnost").all());
  assert.ok(!sve.includes(token) && !sve.includes(red!.token_hash as string), "ni token ni hash u dnevniku");
});

test("provjeri: otvorena → podaci; nepoznat, neispravan, istekao → null", async () => {
  const { token, id } = await izdaj({ email: LOGOPED, ime: "Ana" }, SA);
  assert.deepEqual(await provjeri(token), { id, email: LOGOPED, ime: "Ana", korisnikId: null });
  assert.equal(await provjeri("x".repeat(43)), null);
  assert.equal(await provjeri("prekratko"), null);
  assert.equal(await provjeri(undefined), null);
  assert.equal(await provjeri(token, za(POZIV_SATI - 0.1)) !== null, true);
  assert.equal(await provjeri(token, za(POZIV_SATI + 0.1)), null);
});

test("izdaj: e-mail superadmina se odbija (i velikim slovima)", async () => {
  await odbijeno(izdaj({ email: SA }, SA), "superadmin");
  await odbijeno(izdaj({ email: " A@PRIMJER.HR" }, SA), "superadmin");
  await odbijeno(izdaj({ email: "nije-email" }, SA), "email");
  assert.equal((await db().prepare("SELECT COUNT(*) AS n FROM pozivi").first<number>("n")), 0);
});

test("izdaj: aktivni logoped bez korisnikId se odbija; s korisnikId je pozivnica za novi passkey", async () => {
  const id = await korisnik(LOGOPED, "logoped", 1, "Ana");
  await odbijeno(izdaj({ email: LOGOPED }, SA), "aktivan_logoped");
  const p = await izdaj({ email: LOGOPED, korisnikId: id }, SA);
  assert.deepEqual(await provjeri(p.token), { id: p.id, email: LOGOPED, ime: "Ana", korisnikId: id });
});

test("izdaj s korisnikId: nepostojeći, nije logoped, drugi e-mail → odbijeno", async () => {
  await odbijeno(izdaj({ email: LOGOPED, korisnikId: 999 }, SA), "nema_korisnika");
  const admin = await korisnik("c@primjer.hr", "admin", 1);
  await odbijeno(izdaj({ email: "c@primjer.hr", korisnikId: admin }, SA), "nije_logoped");
  const id = await korisnik(LOGOPED, "logoped", 1);
  await odbijeno(izdaj({ email: "d@primjer.hr", korisnikId: id }, SA), "drugi_email");
});

test("izdaj s korisnikId: deaktivirani logoped → neaktivan (novi passkey ga ne reaktivira); opća pozivnica ga vraća", async () => {
  const id = await korisnik(LOGOPED, "logoped", 0, "Ana");
  await odbijeno(izdaj({ email: LOGOPED, korisnikId: id }, SA), "neaktivan");
  assert.equal((await db().prepare("SELECT COUNT(*) AS n FROM pozivi").first<{ n: number }>())?.n, 0);
  const p = await izdaj({ email: LOGOPED }, SA);
  assert.equal((await provjeri(p.token))?.email, LOGOPED);
});

test("iskoristi: novi logoped (aktivan) + passkey, zapisi s e-mailom pozvanog; drugi put → null", async () => {
  const { token, id } = await izdaj({ email: LOGOPED, ime: "Ana" }, SA);
  const p = await iskoristi(token, kljuc("k1"), "iPhone");
  assert.deepEqual(p, { id, email: LOGOPED, ime: "Ana", korisnikId: null });
  assert.deepEqual(await korisnici(), [{ email: LOGOPED, ime: "Ana", uloga: "logoped", aktivan: 1, deaktiviran_at: null }]);
  assert.deepEqual(await kljucevi(), [{ id: "k1", email: LOGOPED, label: "iPhone" }]);
  const red = await db().prepare("SELECT iskoristena_at, passkey_id FROM pozivi WHERE id = ?").bind(id).first<Record<string, unknown>>();
  assert.ok(red?.iskoristena_at);
  assert.equal(red?.passkey_id, "k1");
  const z = (await zapisi()).slice(1);
  assert.deepEqual(z.map((x) => [x.tko, x.radnja, x.tablica]), [[LOGOPED, "poziv.iskoristen", "pozivi"], [LOGOPED, "korisnik.aktiviran", "korisnici"]]);
  assert.equal(z[1].prije, null, "korisnik je nastao");

  assert.equal(await iskoristi(token, kljuc("k2")), null);
  assert.equal(await provjeri(token), null);
  assert.equal((await kljucevi()).length, 1);
});

test("iskoristi: dva istodobna pokušaja → točno jedan uspije, jedan korisnik, jedan passkey", async () => {
  const { token } = await izdaj({ email: LOGOPED }, SA);
  const ishodi = await Promise.all([iskoristi(token, kljuc("k1")), iskoristi(token, kljuc("k2")), iskoristi(token, kljuc("k3"))]);
  assert.equal(ishodi.filter(Boolean).length, 1);
  assert.equal((await korisnici()).length, 1);
  assert.equal((await kljucevi()).length, 1);
  assert.equal((await zapisi()).filter((x) => x.radnja === "poziv.iskoristen").length, 1);
});

test("naredbeIskoristenja: batch nad već potrošenom pozivnicom (ista milisekunda) ne stvara ništa", async () => {
  const { token } = await izdaj({ email: LOGOPED }, SA);
  const hash = await sha256Hex(token);
  const sada = new Date();
  const prvi = naredbeIskoristenja(hash, kljuc("k1"), "", LOGOPED, sada);
  const drugi = naredbeIskoristenja(hash, kljuc("k2"), "", LOGOPED, sada);
  const r1 = await db().batch(prvi.naredbe);
  const r2 = await db().batch(drugi.naredbe);
  assert.equal(r1[prvi.potrosnja].results.length, 1);
  assert.equal(r2[drugi.potrosnja].results.length, 0);
  assert.deepEqual((await kljucevi()).map((k) => k.id), ["k1"]);
  assert.equal((await korisnici()).length, 1);
  const n = await zapisi();
  assert.equal(n.length, 3, "izdana + iskorištena + korisnik; drugi batch ne ostavlja zapis");
});

test("istekla i opozvana pozivnica se ne mogu iskoristiti; ništa ne nastaje", async () => {
  const a = await izdaj({ email: LOGOPED }, SA, new Date(Date.now() - (POZIV_SATI + 1) * 3600_000));
  assert.equal(await iskoristi(a.token, kljuc("k1")), null);
  const b = await izdaj({ email: "c@primjer.hr" }, SA);
  assert.equal(await opozovi(b.id, SA), true);
  assert.equal(await opozovi(b.id, SA), false, "drugi put nema što opozvati");
  assert.equal(await provjeri(b.token), null);
  assert.equal(await iskoristi(b.token, kljuc("k2")), null);
  assert.deepEqual(await korisnici(), []);
  assert.deepEqual(await kljucevi(), []);
  assert.ok((await zapisi()).some((z) => z.radnja === "poziv.opozvan" && z.tko === SA));
});

test("ADMIN_EMAILS dopunjen nakon izdavanja: pozivnica više ne vrijedi ni izravnim batchem", async () => {
  const { token } = await izdaj({ email: LOGOPED }, SA);
  env.ADMIN_EMAILS = `${SA}, ${LOGOPED.toUpperCase()}`;
  assert.equal(await provjeri(token), null);
  const n = naredbeIskoristenja(await sha256Hex(token), kljuc("k1"), "", LOGOPED, new Date());
  const r = await db().batch(n.naredbe);
  assert.equal(r[n.potrosnja].results.length, 0);
  assert.deepEqual(await korisnici(), []);
  assert.deepEqual(await kljucevi(), []);
});

test("deaktivirani logoped: nova pozivnica ga vrati (aktivan=1, deaktiviran_at=NULL), ime ostaje", async () => {
  await korisnik(LOGOPED, "logoped", 0, "Ana");
  const { token } = await izdaj({ email: LOGOPED }, SA);
  assert.ok(await iskoristi(token, kljuc("k1")));
  assert.deepEqual(await korisnici(), [{ email: LOGOPED, ime: "Ana", uloga: "logoped", aktivan: 1, deaktiviran_at: null }]);
  const z = (await zapisi()).find((x) => x.radnja === "korisnik.aktiviran");
  assert.equal(JSON.parse(z!.prije!).aktivan, 0);
  assert.equal(JSON.parse(z!.poslije!).aktivan, 1);
});

test("redak 'admin' izvan ADMIN_EMAILS postaje logoped tek pozivnicom", async () => {
  await korisnik(LOGOPED, "admin", 1);
  const { token } = await izdaj({ email: LOGOPED, ime: "Ana" }, SA);
  assert.ok(await iskoristi(token, kljuc("k1")));
  assert.deepEqual(await korisnici(), [{ email: LOGOPED, ime: "Ana", uloga: "logoped", aktivan: 1, deaktiviran_at: null }]);
});

test("novi passkey postojećem logopedu: drugi ključ, redak isti, bez zapisa o korisniku", async () => {
  const id = await korisnik(LOGOPED, "logoped", 1, "Ana");
  await db().prepare("INSERT INTO admin_passkeys (id, email, public_key, label, created_at) VALUES ('stari', ?, 'AAAA', 'stari', '2026-11-01')")
    .bind(LOGOPED).run();
  const { token } = await izdaj({ email: LOGOPED, korisnikId: id }, SA);
  assert.deepEqual(await iskoristi(token, kljuc("novi")), { id: 1, email: LOGOPED, ime: "Ana", korisnikId: id });
  assert.deepEqual((await kljucevi()).map((k) => k.id).sort(), ["novi", "stari"]);
  assert.deepEqual(await korisnici(), [{ email: LOGOPED, ime: "Ana", uloga: "logoped", aktivan: 1, deaktiviran_at: null }]);
  assert.deepEqual((await zapisi()).map((z) => z.radnja), ["poziv.izdan", "poziv.iskoristen"]);
});

test("nova pozivnica za isti e-mail zamijeni staru (vrijedi samo zadnji link)", async () => {
  const a = await izdaj({ email: LOGOPED }, SA);
  const b = await izdaj({ email: LOGOPED }, SA);
  assert.equal(await provjeri(a.token), null);
  assert.ok(await provjeri(b.token));
  assert.deepEqual((await otvorenePozivnice()).map((p) => p.id), [b.id]);
  assert.deepEqual((await zapisi()).map((z) => z.radnja), ["poziv.izdan", "poziv.zamijenjen", "poziv.izdan"]);
});

test("vrati(): zapisi o pozivnicama i korisnicima se ne poništavaju", async () => {
  const { token } = await izdaj({ email: LOGOPED }, SA);
  await iskoristi(token, kljuc("k1"));
  for (const z of await db().prepare("SELECT id FROM aktivnost").all<{ id: number }>().then((r) => r.results)) {
    for (const smjer of ["ponisti", "vrati"] as const) {
      const r = await vrati(z.id, smjer, SA, null);
      assert.equal(r.ok, false);
    }
  }
  assert.equal((await korisnici())[0].aktivan, 1);
  assert.equal(await db().prepare("SELECT COUNT(*) AS n FROM pozivi WHERE iskoristena_at IS NOT NULL").first<number>("n"), 1);
});
