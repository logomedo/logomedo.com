// verifyLogin: ključ čiji vlasnik nema ulogu odbija se prije WebAuthn provjere.
// Pravi WebAuthn se ne radi; lažni odgovor je Proxy koji bilježi koja polja su pročitana.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { napraviD1 } from "../test/d1.ts";
import { env } from "../test/cloudflare-workers.ts";
import { verifyLogin } from "./passkey.ts";

const SA = "a@primjer.hr";
const URL_ADMIN = new URL("https://logomedo.com/admin/prijava");

beforeEach(() => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
});

const db = () => env.DB as D1Database;

async function kljuc(id: string, email: string) {
  // public_key mora biti valjan base64url: dekodira se prije poziva verifyAuthenticationResponse.
  await db().prepare(
    "INSERT INTO admin_passkeys (id, email, public_key, counter, transports, label, created_at) VALUES (?, ?, 'AAAA', 0, NULL, 'test', ?)",
  ).bind(id, email, new Date().toISOString()).run();
}

async function korisnik(email: string, uloga: "logoped" | "admin", aktivan: number) {
  await db().prepare("INSERT INTO korisnici (email, uloga, aktivan) VALUES (?, ?, ?)").bind(email, uloga, aktivan).run();
}

/** Lažni odgovor: `id` je stvaran, sve ostalo je prazno; `procitano` kaže je li WebAuthn krenuo. */
function lazniOdgovor(id: string) {
  const procitano = new Set<string>();
  const odgovor = new Proxy({ id, rawId: id, type: "public-key", response: {}, clientExtensionResults: {} }, {
    get(t, k, r) {
      if (typeof k === "string") procitano.add(k);
      return Reflect.get(t, k, r);
    },
  }) as unknown as AuthenticationResponseJSON;
  return { odgovor, procitano };
}

const stanjeKljuca = (id: string) =>
  db().prepare("SELECT counter, last_used_at FROM admin_passkeys WHERE id = ?").bind(id).first();

for (const [opis, priprema] of [
  ["deaktivirani logoped", () => korisnik("logoped@primjer.hr", "logoped", 0)],
  ["redak 'admin' izvan ADMIN_EMAILS", () => korisnik("logoped@primjer.hr", "admin", 1)],
  ["vlasnik bez retka i izvan ADMIN_EMAILS", async () => {}],
] as const) {
  test(`verifyLogin: ${opis} → null prije WebAuthn provjere`, async () => {
    await priprema();
    await kljuc("kljuc-1", "logoped@primjer.hr");
    const { odgovor, procitano } = lazniOdgovor("kljuc-1");
    assert.equal(await verifyLogin(URL_ADMIN, odgovor), null);
    assert.deepEqual([...procitano], ["id"], "WebAuthn nije ni pogledao odgovor");
    assert.deepEqual(await stanjeKljuca("kljuc-1"), { counter: 0, last_used_at: null });
  });
}

test("verifyLogin: nepostojeći ključ → null", async () => {
  const { odgovor, procitano } = lazniOdgovor("nema-ga");
  assert.equal(await verifyLogin(URL_ADMIN, odgovor), null);
  assert.deepEqual([...procitano], ["id"]);
});

test("verifyLogin: aktivni logoped s lažnim odgovorom → null bez iznimke (pada potpis)", async () => {
  await korisnik("logoped@primjer.hr", "logoped", 1);
  await kljuc("kljuc-2", "logoped@primjer.hr");
  const { odgovor, procitano } = lazniOdgovor("kljuc-2");
  assert.equal(await verifyLogin(URL_ADMIN, odgovor), null);
  assert.ok(procitano.size > 1, "došao je do WebAuthn provjere");
  assert.deepEqual(await stanjeKljuca("kljuc-2"), { counter: 0, last_used_at: null });
});

test("verifyLogin: superadmin s lažnim odgovorom → null bez iznimke", async () => {
  await kljuc("kljuc-3", SA);
  const { odgovor, procitano } = lazniOdgovor("kljuc-3");
  assert.equal(await verifyLogin(URL_ADMIN, odgovor), null);
  assert.ok(procitano.size > 1);
});
