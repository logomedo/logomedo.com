import { test } from "node:test";
import assert from "node:assert/strict";
import { fonemi, pojave, slug } from "./fonemi.ts";

const G = ["C", "Č", "L", "R", "S", "Š", "Z", "Ž"];
const p = (r: string) => pojave(r, G).map((x) => `${x.glas}:${x.pozicija}`).sort();

test("dvoslovi nisu L ni N", () => {
  assert.deepEqual(fonemi("ljuljačka"), ["LJ", "U", "LJ", "A", "Č", "K", "A"]);
  assert.deepEqual(p("ljuljačka"), ["Č:medijalna"]);
  assert.deepEqual(fonemi("džep"), ["DŽ", "E", "P"]);
  assert.deepEqual(p("džep"), []);
});

test("skupina je samo početna suglasnička skupina s R", () => {
  assert.deepEqual(p("krastavac"), ["C:finalna", "R:skupina", "S:medijalna"]);
  assert.deepEqual(p("crv"), ["C:inicijalna", "R:skupina"]);
  assert.deepEqual(p("torba"), ["R:medijalna"]);
  assert.deepEqual(p("sir"), ["R:finalna", "S:inicijalna"]);
});

test("slug razlikuje kvačice", () => {
  assert.notEqual(slug("koš"), slug("kos"));
  assert.equal(slug("Morski pas"), "morski-pas");
  assert.equal(slug("đak"), "djak");
});
