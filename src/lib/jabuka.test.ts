import { test } from "node:test";
import assert from "node:assert/strict";
import { jabukaSvg } from "./jabuka.ts";

test("jabuka: točno N plodova s id-jem lampice, i za veliki N", () => {
  for (const n of [1, 5, 12, 30]) {
    const svg = jabukaSvg(n);
    assert.equal((svg.match(/class="lampica"/g) ?? []).length, n, `n=${n}`);
    assert.ok(svg.includes(`id="lampica-${n - 1}"`));
    assert.equal((jabukaSvg(n, { zaIspis: true }).match(/<circle/g) ?? []).length, n);
  }
  assert.equal((jabukaSvg(0).match(/class="lampica"/g) ?? []).length, 0);
});
