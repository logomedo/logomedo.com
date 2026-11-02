import { test } from "node:test";
import assert from "node:assert/strict";
import { dimenzije, orijentacija } from "./dimenzije.ts";

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

test("PNG i JPEG zaglavlja", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(765), ...be32(1024), 8, 6, 0, 0, 0]);
  assert.deepEqual(dimenzije(png), { sirina: 765, visina: 1024 });
  assert.equal(orijentacija(dimenzije(png)!), "uspravno");
  // SOI, APP0 (duljina 16), SOF0: duljina 17, preciznost 8, visina 765, širina 1024
  const app0 = [0xff, 0xe0, 0, 16, ...Array(14).fill(0)];
  const jpg = new Uint8Array([0xff, 0xd8, ...app0, 0xff, 0xc0, 0, 17, 8, 0x02, 0xfd, 0x04, 0x00, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(dimenzije(jpg), { sirina: 1024, visina: 765 });
  assert.equal(orijentacija(dimenzije(jpg)!), "vodoravno");
  assert.equal(dimenzije(new Uint8Array([1, 2, 3])), null);
});
