import { test } from "node:test";
import assert from "node:assert/strict";
import { izrezi, okviri } from "./mp3.ts";

/** Lažni CBR 128 kbps / 44,1 kHz: okvir 417 bajtova, prvi bajt podataka = redni broj. */
function lazni(n: number, xing = false): Uint8Array {
  const b = new Uint8Array(417 * n);
  for (let i = 0; i < n; i++) {
    b.set([0xff, 0xfb, 0x90, 0x00], i * 417);
    b[i * 417 + 4] = i;
    if (xing && i === 0) b.set([...new TextEncoder().encode("Xing")], 40);
  }
  return b;
}

test("okviri: CBR 128 kbps", () => {
  const o = okviri(lazni(10));
  assert.equal(o.length, 10);
  assert.equal(o[3].od, 3 * 417);
});

test("izrezi: od sekunde, bez Xing okvira", () => {
  const dur = 1152 / 44100;   // ~26 ms
  const r = izrezi(lazni(100, true), 40 * dur, 0);
  assert.equal(r.length, 60 * 417);
  assert.equal(r[4], 40);
  const s = izrezi(lazni(100, true), 0);
  assert.equal(s.length, 99 * 417);   // samo Xing ispao
});
