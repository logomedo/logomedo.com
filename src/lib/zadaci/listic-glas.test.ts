import { test } from "node:test";
import assert from "node:assert/strict";
import { brojSlika, izaberi, moguce, naslovListica, odgovara, poPrvomGlasu, type RijecGlasova } from "./listic-glas.ts";

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

test("broj slika: zadano 12, „sve” do najviše, nasumičnih n kad ih ima više", () => {
  assert.equal(brojSlika(null, 150), 12);
  assert.equal(brojSlika("8", 150), 8);
  assert.equal(brojSlika("sve", 150), 150);
  assert.equal(brojSlika("500", 150), 150);
  const sve = Array.from({ length: 30 }, (_, i) => i);
  const x = izaberi(sve, 12);
  assert.equal(x.length, 12);
  assert.equal(new Set(x).size, 12);
  assert.deepEqual(izaberi(sve.slice(0, 5), 12), [0, 1, 2, 3, 4]);
});

test("po glasovima: rima broji skupine s glasom, prvi glas po slovima", () => {
  const G: RijecGlasova[] = [
    { id: 1, rijec: "krava", rima: "ava", g: [[R, "medijalna"]] },
    { id: 2, rijec: "glava", rima: "ava", g: [[L, "medijalna"]] },
    { id: 3, rijec: "trava", rima: "ava", g: [[R, "medijalna"]] },
    { id: 4, rijec: "sat", rima: "at", g: [] },
    { id: 5, rijec: "brat", rima: "at", g: [[R, "medijalna"]] },
    { id: 6, rijec: "lonac", rima: "onac", g: [[L, "inicijalna"]] },
    { id: 7, rijec: "ljuljačka", rima: "ačka", g: [] },
  ];
  assert.equal(moguce("odabir", G, { glasovi: [R], pozicija: "", bez: [] }), 2);
  assert.equal(moguce("uljez", G, { glasovi: [R], pozicija: "", bez: [] }), 1);
  assert.equal(moguce("povezivanje", G, { glasovi: [L], pozicija: "inicijalna", bez: [] }), 0);
  // „bez L” izbacuje GLAVU iz skupine pa za uljeza ostaju samo dvije.
  assert.equal(moguce("uljez", G, { glasovi: [R], pozicija: "", bez: ["L"] }), 0);
  assert.equal(moguce("slogovi", G, { glasovi: [R], pozicija: "", bez: [] }), 3);
  assert.deepEqual(poPrvomGlasu(G, ["L", "LJ", "Ž"]), { L: 1, LJ: 1, Ž: 0 });
});
