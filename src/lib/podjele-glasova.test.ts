import { test } from "node:test";
import assert from "node:assert/strict";
import { PODJELE, poPodjeli, SUGLASNICI } from "./podjele-glasova.ts";

test("podjele: svaki od 25 suglasnika je točno u jednoj skupini svake podjele", () => {
  assert.equal(SUGLASNICI.length, 25);
  for (const [ime, p] of Object.entries(PODJELE)) {
    const svi = p.skupine.flatMap((s) => s.glasovi);
    assert.equal(svi.length, 25, ime);
    assert.deepEqual([...svi].sort(), [...SUGLASNICI].sort(), ime);
  }
});

test("po podjeli: redom skupina, prazne se preskaču, nepoznato u Ostalo", () => {
  const g = ["S", "K", "B", "A"].map((oznaka) => ({ oznaka }));
  const r = poPodjeli(g, "mjesto");
  assert.deepEqual(r.map((x) => [x.skupina.naziv, x.glasovi.map((y) => y.oznaka).join("")]), [["Bilabijali", "B"], ["Dentali", "S"], ["Velari", "K"], ["Ostalo", "A"]]);
});
