import { test } from "node:test";
import assert from "node:assert/strict";
import { izgovorZa, kljucZvuka, prolazi, slicnost } from "./zvukovi-tekst.ts";

test("ključ ne ovisi o velikim slovima i razmacima", () => {
  assert.equal(kljucZvuka("  Što se rimuje s riječi  ČAJ? "), "što se rimuje s riječi čaj?");
  assert.equal(kljucZvuka("ČAJ"), kljucZvuka("čaj"));
});

test("izgovor: veliko prvo slovo i točka", () => {
  assert.equal(izgovorZa("jaslice"), "Jaslice.");
  assert.equal(izgovorZa("što se rimuje s riječi čaj?"), "Što se rimuje s riječi čaj?");
  assert.equal(izgovorZa("bravo! sve lampice svijetle."), "Bravo! Sve lampice svijetle.");
});

test("riječ mora biti prepisana točno, s dijakriticima", () => {
  assert.ok(prolazi("jaslice", "Jaslice."));
  assert.ok(!prolazi("jaslice", "Jazzlis"));
  assert.ok(!prolazi("čaj", "caj"));
});

test("rečenica smije imati sitnu razliku prijepisa", () => {
  assert.ok(prolazi("Koja se riječ ne rimuje s ostalima?", "Koja se riječ ne rimuje sa ostalima"));
  assert.ok(!prolazi("Poveži riječi koje se rimuju.", "Pove riči ko se ri"));
  assert.equal(slicnost("a b", "A, b!"), 1);
});
