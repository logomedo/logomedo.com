import { test } from "node:test";
import assert from "node:assert/strict";
import { blokIspravaka, spojiPrompt } from "./prompt.ts";

test("sistemski prompt ide iza prompta posla", () => {
  assert.equal(spojiPrompt("Jabuka. ", " Bez lica. "), "Jabuka.\n\nBez lica.");
});

test("prazan sistemski prompt ne dodaje ništa", () => {
  assert.equal(spojiPrompt("Jabuka.", ""), "Jabuka.");
  assert.equal(spojiPrompt("Jabuka.", null), "Jabuka.");
  assert.equal(spojiPrompt("Jabuka.", "   "), "Jabuka.");
});

test("ispravci recenzenta idu iza sistemskog prompta, kao upute (ne „Avoid”)", () => {
  const posao = `Mač.\n\n${blokIspravaka(["Ovo je mačka, želim sword", "  "])}`;
  const p = spojiPrompt(posao, "Rules. NOTHING EXTRA.");
  assert.ok(p.startsWith("Mač.\n\nRules. NOTHING EXTRA.\n\nREVIEWER CORRECTIONS."));
  assert.ok(p.endsWith("\n- Ovo je mačka, želim sword"));
  assert.ok(!p.includes("Avoid"));
});

test("bez razloga nema bloka ispravaka", () => {
  assert.equal(blokIspravaka([" ", ""]), "");
  assert.equal(spojiPrompt("Jabuka.", "Pravila."), "Jabuka.\n\nPravila.");
});

test("zabrana i dorada: Wrong / Draw instead, stari tekstualni razlog ostaje kakav je", () => {
  const b = blokIspravaka(["Moderniji", { ne: "Ovo je mačka", da: "Mač, oružje (sword)" }, { ne: null, da: "Strelica na rep" }, { ne: " ", da: null }]);
  assert.ok(b.includes("\n- Moderniji\n- Wrong: Ovo je mačka → Draw instead: Mač, oružje (sword)\n- Draw instead: Strelica na rep"));
  assert.ok(b.endsWith("Strelica na rep"));
});
