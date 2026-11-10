import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizirajZnak, POCETNI_SIMBOLI, POCETNI_ZNAKOVI, prikazRijeci, skupinaZnaka, slugZnaka, usporediZnakove } from "./znakovi.ts";

test("skupina znaka", () => {
  assert.equal(skupinaZnaka("B"), "veliko");
  assert.equal(skupinaZnaka("DŽ"), "veliko");
  assert.equal(skupinaZnaka("lj"), "malo");
  assert.equal(skupinaZnaka("7"), "brojka");
  assert.equal(skupinaZnaka("10"), "brojka");
  assert.equal(skupinaZnaka("+"), "ostalo");
  assert.equal(skupinaZnaka("Lj"), "ostalo");
});

test("slug razlikuje velika i mala slova", () => {
  assert.equal(slugZnaka("b"), "znak-b");
  assert.equal(slugZnaka("B"), "znak-b-veliko");
  assert.equal(slugZnaka("DŽ"), "znak-dzh-veliko");
  assert.equal(slugZnaka("č"), "znak-ch");
  assert.equal(slugZnaka("7"), "znak-7");
  assert.equal(slugZnaka("+"), "znak-u2b");
  const svi = POCETNI_ZNAKOVI.map(slugZnaka);
  assert.equal(new Set(svi).size, svi.length);
});

test("normalizacija unosa", () => {
  assert.equal(normalizirajZnak(" b "), "b");
  assert.equal(normalizirajZnak("DŽ"), "DŽ");
  assert.equal(normalizirajZnak(""), null);
  assert.equal(normalizirajZnak("abcd"), null);
});

test("redoslijed: velika, mala, brojke; DŽ iza D", () => {
  const s = ["7", "b", "DŽ", "A", "D", "10", "+", "a", "2"].sort(usporediZnakove);
  assert.deepEqual(s, ["A", "D", "DŽ", "a", "b", "2", "7", "10", "+"]);
});

test("početnih znakova 70, prikaz ne mijenja veličinu znaka", () => {
  assert.equal(POCETNI_ZNAKOVI.length, 70);
  assert.equal(prikazRijeci({ rijec: "b", znak: true }), "b");
  assert.equal(prikazRijeci({ rijec: "miš" }), "MIŠ");
});

test("simboli su svi u skupini simbola i imaju različit slug", () => {
  assert.equal(POCETNI_SIMBOLI.length, 20);
  assert.ok(POCETNI_SIMBOLI.every((z) => skupinaZnaka(z) === "ostalo"));
  const svi = [...POCETNI_ZNAKOVI, ...POCETNI_SIMBOLI].map(slugZnaka);
  assert.equal(new Set(svi).size, svi.length);
  assert.equal(slugZnaka("§"), "znak-ua7");
});
