// Staging smije imati RESEND_API_KEY, ali šalje samo adminima i na @logomedo.com (src/lib/email.ts `smijePrimiti`):
// baza je kopija produkcijske, sa stvarnim adresama logopeda.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { env } from "./test/cloudflare-workers.ts";
import { napraviD1 } from "./test/d1.ts";
import { posaljiPozivnicu, smijePrimiti } from "./email.ts";

beforeEach(() => { env.DB = napraviD1(); env.ADMIN_EMAILS = "Sef@Primjer.test,drugi@primjer.test"; env.RESEND_API_KEY = "re_test"; });
afterEach(() => { delete env.OKRUZENJE; delete env.RESEND_API_KEY; delete env.ADMIN_EMAILS; });

test("produkcija: svima", () => {
  delete env.OKRUZENJE;
  assert.equal(smijePrimiti("ana@primjer.test"), true);
});

test("staging: admini, njihovi +aliasi i @logomedo.com; nitko drugi", () => {
  env.OKRUZENJE = "staging";
  for (const e of ["sef@primjer.test", "SEF+proba1@primjer.test", "drugi+x@primjer.test", "naplata-test-1@logomedo.com"]) assert.equal(smijePrimiti(e), true, e);
  for (const e of ["ana@primjer.test", "sef@primjer.test.hr", "sef@drugo.test", "x@logomedo.com.hr", "sefx@primjer.test"]) assert.equal(smijePrimiti(e), false, e);
});

test("staging: pozivnica stvarnom logopedu ne ide u Resend", async () => {
  env.OKRUZENJE = "staging";
  let pozvano = 0;
  const f = (async () => { pozvano++; return new Response("{}"); }) as typeof fetch;
  const r = await posaljiPozivnicu({ email: "ana@primjer.test", ime: "Ana", url: "https://x/admin/poziv#t", istjece: "2026-11-28T00:00:00Z" }, f, 0);
  assert.deepEqual(r, { ok: false, razlog: "staging" });
  assert.equal(pozvano, 0);
});
