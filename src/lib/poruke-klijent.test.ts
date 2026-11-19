// Kratica brzog odgovora (`/kratica` + Tab) i umetanje iz izbornika (src/lib/poruke-klijent.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { umetniKraticu, umetniNaKursor } from "./poruke-klijent.ts";

const K = new Map([["link", "Šaljem novi link."], ["hvala", "Hvala!"]]);

test("kratica prije kursora se zamjenjuje", () => {
  assert.deepEqual(umetniKraticu("/link", 5, K), { vrijednost: "Šaljem novi link.", kursor: 17 });
  assert.deepEqual(umetniKraticu("Bok,\n/hvala kraj", 11, K), { vrijednost: "Bok,\nHvala! kraj", kursor: 11 });
  assert.deepEqual(umetniKraticu("a /LINK", 7, K), { vrijednost: "a Šaljem novi link.", kursor: 19 });
});

test("bez kratice ili nepoznata: null", () => {
  assert.equal(umetniKraticu("https://x/link", 14, K), null, "dio adrese nije kratica");
  assert.equal(umetniKraticu("/nema", 5, K), null);
  assert.equal(umetniKraticu("/link ", 6, K), null);
  assert.equal(umetniKraticu("", 0, K), null);
});

test("umetanje iz izbornika", () => {
  assert.deepEqual(umetniNaKursor("", 0, 0, "T"), { vrijednost: "T", kursor: 1 });
  assert.deepEqual(umetniNaKursor("Bok,", 4, 4, "T"), { vrijednost: "Bok,\n\nT", kursor: 7 });
  assert.deepEqual(umetniNaKursor("Bok,\nX", 5, 6, "T"), { vrijednost: "Bok,\n\nT", kursor: 7 });
});
