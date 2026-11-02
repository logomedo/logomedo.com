import { test } from "node:test";
import assert from "node:assert/strict";
import { spojiPrompt } from "./prompt.ts";

test("sistemski prompt ide iza prompta posla", () => {
  assert.equal(spojiPrompt("Jabuka. ", " Bez lica. "), "Jabuka.\n\nBez lica.");
});

test("prazan sistemski prompt ne dodaje ništa", () => {
  assert.equal(spojiPrompt("Jabuka.", ""), "Jabuka.");
  assert.equal(spojiPrompt("Jabuka.", null), "Jabuka.");
  assert.equal(spojiPrompt("Jabuka.", "   "), "Jabuka.");
});
