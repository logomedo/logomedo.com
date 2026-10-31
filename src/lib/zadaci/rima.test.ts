import { test } from "node:test";
import assert from "node:assert/strict";
import { brojSlogova, izvediRimu } from "./rima.ts";

test("suglasnik na kraju: od zadnjeg samoglasnika", () => {
  assert.equal(izvediRimu("dabar"), "AR");
  assert.equal(izvediRimu("ormar"), "AR");
  assert.equal(izvediRimu("miš"), "IŠ");
  assert.equal(izvediRimu("kiš"), "IŠ");
  assert.equal(izvediRimu("med"), "ED");
});

test("samoglasnik na kraju: od predzadnjeg", () => {
  assert.equal(izvediRimu("krava"), "AVA");
  assert.equal(izvediRimu("trava"), "AVA");
  assert.equal(izvediRimu("koza"), "OZA");
  assert.equal(izvediRimu("roza"), "OZA");
});

test("IJE je jedan slog, slogotvorno R je jezgra", () => {
  assert.equal(izvediRimu("strijela"), "ELA");
  assert.equal(izvediRimu("pčela"), "ELA");
  assert.equal(izvediRimu("crkva"), "RKVA");
  assert.equal(izvediRimu("vrt"), "RT");
  assert.equal(brojSlogova("strijela"), 2);
  assert.equal(brojSlogova("crkva"), 2);
});

test("složenica i jednosložna na samoglasnik", () => {
  assert.equal(izvediRimu("luk-strijela"), "ELA");
  assert.equal(izvediRimu("pa"), "A");
  assert.equal(izvediRimu("ps"), null);
});
