import { test } from "node:test";
import assert from "node:assert/strict";
import { borIgraSvg, jabukaIgraSvg, mjestaBor, mjestaJabuka, rub } from "./stabla-igre.ts";

test("stabla igre: točno N lampica/jabuka, sve unutar obrisa krošnje", () => {
  for (const n of [0, 1, 5, 12, 24, 30, 45]) {
    assert.equal((borIgraSvg(n).match(/class="lampica"/g) ?? []).length, n, `bor ${n}`);
    assert.equal((jabukaIgraSvg(n).match(/class="lampica"/g) ?? []).length, n, `jabuka ${n}`);
    for (const [s, tocke] of [["bor", mjestaBor(n).tocke], ["jabuka", mjestaJabuka(n)]] as const) {
      for (const t of tocke) {
        const [l, d] = rub(s, t.y);
        assert.ok(t.x > l && t.x < d, `${s} n=${n}: (${t.x.toFixed(0)}, ${t.y.toFixed(0)}) izvan ${l}–${d}`);
      }
    }
  }
});
