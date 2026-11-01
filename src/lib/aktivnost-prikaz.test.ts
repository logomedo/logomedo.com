import { test } from "node:test";
import assert from "node:assert/strict";
import { grupiraj, razlike, relativno } from "./aktivnost-prikaz.ts";

test("razlike: status slike, bez vremena pregleda", () => {
  const a = JSON.stringify({ rijec_id: 1, stil_id: 1, status: "kandidat", razlog: null, pregledao: null, pregledano_at: null });
  const b = JSON.stringify({ rijec_id: 1, stil_id: 1, status: "odobrena", razlog: null, pregledao: "ana@x.hr", pregledano_at: "2026-11-01 10:00:00" });
  assert.deepEqual(razlike(a, b), [
    { polje: "status", prije: "kandidat", poslije: "odobrena" },
    { polje: "pregledao", prije: "—", poslije: "ana@x.hr" },
  ]);
});

test("razlike: glasovi kao maknuti i dodani", () => {
  const g = (glas: string, pozicija: string, potvrdeno = 1) => ({ glas, glas_id: 1, pozicija, potvrdeno });
  const a = JSON.stringify({ rijec: "riba", glasovi: [g("R", "inicijalna"), g("B", "medijalna", 0)] });
  const b = JSON.stringify({ rijec: "riba", glasovi: [g("R", "inicijalna"), g("B", "medijalna")] });
  assert.deepEqual(razlike(a, b), [{ polje: "glasovi", prije: "—", poslije: "B medijalna" }]);
  const c = JSON.stringify({ rijec: "riba", glasovi: [g("B", "medijalna", 0)] });
  assert.deepEqual(razlike(a, c), [{ polje: "glasovi", prije: "R inicijalna", poslije: "—" }]);
});

test("razlike: novi redak", () => {
  assert.deepEqual(razlike(null, JSON.stringify({ status: "ceka", prompt: "p" })), [
    { polje: "status", prije: "—", poslije: "ceka" }, { polje: "prompt", prije: "—", poslije: "p" },
  ]);
});

test("grupiraj: samo uzastopne iste grupe", () => {
  const s = ["a", "a", "b", "a"].map((grupa, id) => ({ id, grupa }));
  assert.deepEqual(grupiraj(s).map((g) => g.map((x) => x.id)), [[0, 1], [2], [3]]);
});

test("relativno", () => {
  const sada = Date.parse("2026-11-01T10:00:00Z");
  assert.equal(relativno("2026-11-01 09:59:40", sada), "upravo");
  assert.equal(relativno("2026-11-01 09:50:00", sada), "prije 10 min");
  assert.equal(relativno("2026-11-01 07:00:00", sada), "prije 3 h");
});
