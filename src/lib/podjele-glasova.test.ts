import { test } from "node:test";
import assert from "node:assert/strict";
import { PODJELE, poPodjeli, SUGLASNICI, SVI_GLASOVI } from "./podjele-glasova.ts";

test("podjele: svaki od 30 glasova je točno u jednoj skupini svake podjele", () => {
  assert.equal(SUGLASNICI.length, 25);
  assert.equal(SVI_GLASOVI.length, 30);
  for (const [ime, p] of Object.entries(PODJELE)) {
    const svi = p.skupine.flatMap((s) => s.glasovi);
    assert.equal(svi.length, 30, ime);
    assert.deepEqual([...svi].sort(), [...SVI_GLASOVI].sort(), ime);
  }
});

test("po podjeli: redom skupina, prazne se preskaču, nepoznato u Ostalo", () => {
  const g = ["S", "K", "B", "A", "X"].map((oznaka) => ({ oznaka }));
  const r = poPodjeli(g, "mjesto");
  assert.deepEqual(r.map((x) => [x.skupina.naziv, x.glasovi.map((y) => y.oznaka).join("")]), [["Bilabijali", "B"], ["Dentali", "S"], ["Velari", "K"], ["Samoglasnici", "A"], ["Ostalo", "X"]]);
});

import { opisGlasa, skupineGlasa } from "./podjele-glasova.ts";
test("skupine glasa i opis: S dental, frikativ, bezvučni; L bez ponavljanja sonanta; A samoglasnik", () => {
  const s = skupineGlasa("S");
  assert.deepEqual([s.mjesto?.kod, s.nacin?.kod, s.zvucnost?.kod], ["dentali", "frikativi", "bezvucni"]);
  assert.equal(opisGlasa("S"), "Dentali · frikativi · bezvučni");
  assert.equal(opisGlasa("L"), "Alveolari · sonanti");
  assert.equal(opisGlasa("A"), "Samoglasnici");
});
