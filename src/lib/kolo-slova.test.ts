import { test } from "node:test";
import assert from "node:assert/strict";
import { rasporedKola } from "./kolo-slova.ts";
import { ABECEDA, BOJE_KOLA } from "./zadaci/vrste.ts";

test("kolo: susjedna polja nikad iste boje, za svaku temu i broj slova 2–30", () => {
  for (const [kod, tema] of Object.entries(BOJE_KOLA)) {
    for (let k = 2; k <= ABECEDA.length; k++) {
      const slova = ABECEDA.slice(0, k);
      const { polja, boje } = rasporedKola(slova, tema.polja.length);
      const n = polja.length;
      for (let i = 0; i < n; i++) assert.notEqual(boje[i], boje[(i + 1) % n], `${kod}, ${k} slova: polja ${i} i ${(i + 1) % n}`);
      assert.deepEqual([...new Set(polja)].sort(), [...slova].sort(), `${kod}, ${k} slova: sva slova na kolu`);
      assert.ok(n <= 30, `${kod}, ${k} slova: ${n} polja`);
    }
  }
});

test("kolo: crveno-bijelo s 3 slova ponovi slova, sa 17 dobije jedno zlatno polje", () => {
  assert.deepEqual(rasporedKola(["B", "K", "M"], 2).polja, ["B", "K", "M", "B", "K", "M"]);
  const { polja, boje } = rasporedKola(ABECEDA.slice(0, 17), 2);
  assert.equal(polja.length, 17);
  assert.equal(boje.filter((b) => b === -1).length, 1);
});
