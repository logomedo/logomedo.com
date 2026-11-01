import { test } from "node:test";
import assert from "node:assert/strict";
import { izazovIz, ispravanIzazov, ispravanVerifikator, jednako, nasumicno, oznakaUredaja } from "./pkce.ts";

test("izazov S256 iz RFC 7636, dodatak B", async () => {
  assert.equal(await izazovIz("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("verifikator i izazov: format", async () => {
  const v = nasumicno(32);
  assert.ok(ispravanVerifikator(v));
  assert.ok(ispravanIzazov(await izazovIz(v)));
  assert.ok(!ispravanVerifikator("kratko"));
  assert.ok(!ispravanVerifikator("a".repeat(129)));
  assert.ok(!ispravanIzazov("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-c="));
});

test("jednako i oznaka uređaja", () => {
  assert.ok(jednako("abc", "abc"));
  assert.ok(!jednako("abc", "abd"));
  assert.ok(!jednako("abc", "abcd"));
  assert.equal(oznakaUredaja("  Pixel\n 9 "), "Pixel 9");
  assert.equal(oznakaUredaja(""), null);
  assert.equal(oznakaUredaja(42), null);
});
