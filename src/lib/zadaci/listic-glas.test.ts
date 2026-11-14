import { test } from "node:test";
import assert from "node:assert/strict";
import { naslovListica, odgovara, type RijecGlasova } from "./listic-glas.ts";

const L = 7, R = 8;
const rijeci: RijecGlasova[] = [
  { id: 1, rijec: "lav", g: [[L, "inicijalna"]] },
  { id: 2, rijec: "lopta", g: [[L, "inicijalna"]] },
  { id: 3, rijec: "ljuljačka", g: [] },
  { id: 4, rijec: "riba", g: [[R, "inicijalna"]] },
  { id: 5, rijec: "lisica", g: [[L, "inicijalna"]] },
  { id: 6, rijec: "lubenica", g: [[L, "inicijalna"]] },
  { id: 7, rijec: "ruka", g: [[R, "inicijalna"]] },
  { id: 8, rijec: "lokvanj", g: [[L, "inicijalna"]] },
  { id: 9, rijec: "lizalica", g: [[L, "inicijalna"], [L, "medijalna"]] },
  { id: 10, rijec: "lovor", g: [[L, "inicijalna"], [R, "finalna"]] },
];
const ids = (f: Parameters<typeof odgovara>[1]) => rijeci.filter((r) => odgovara(r, f)).map((r) => r.id);

test("listić po glasovima: više glasova, pozicija i isključeni glasovi", () => {
  assert.deepEqual(ids({ glasovi: [L, R], pozicija: "inicijalna", bez: [] }), [1, 2, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(ids({ glasovi: [L], pozicija: "medijalna", bez: [] }), [9]);
  assert.deepEqual(ids({ glasovi: [L], pozicija: "", bez: ["R"] }), [1, 2, 5, 6, 8, 9]);
  assert.deepEqual(ids({ glasovi: [L], pozicija: "", bez: ["R", "C"] }), [1, 2, 8]);
  // „Bez L” ne izbacuje LJ (LJULJAČKA), a bez popisa glasova vrijedi za sve riječi.
  assert.deepEqual(ids({ glasovi: [], pozicija: "", bez: ["L"] }), [3, 4, 7]);
});

test("naslov listića", () => {
  assert.equal(naslovListica(["L"], "inicijalna", []), "Glas L – inicijalna pozicija");
  assert.equal(naslovListica(["L", "R"], "", ["Š"]), "Glasovi L, R, bez Š");
  assert.equal(naslovListica([], "", ["R", "L"]), "Bez R, L");
});
