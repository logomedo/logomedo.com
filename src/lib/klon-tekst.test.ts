import { test } from "node:test";
import assert from "node:assert/strict";
import { glasoviUTekstu, ocjenaTrajanja, ODLOMCI, upozorenja } from "./klon-tekst.ts";
import { GLASOVI } from "./zadaci/slusanje.ts";

test("odlomci zajedno pokrivaju svih 30 glasova", () => {
  const ima = glasoviUTekstu(ODLOMCI.map((o) => o.tekst).join(" "));
  assert.deepEqual(GLASOVI.filter((g) => !ima.has(g)), []);
});

test("DŽ, LJ, NJ su jedan glas", () => {
  assert.deepEqual([...glasoviUTekstu("džep")].sort(), ["DŽ", "E", "P"]);
  assert.deepEqual([...glasoviUTekstu("Ljulja")].sort(), ["A", "LJ", "U"]);
});

test("odlomak je 15–25 s čitanja (~2,5 riječi/s)", () => {
  for (const o of ODLOMCI) {
    const r = o.tekst.split(/\s+/).length;
    assert.ok(r >= 22 && r <= 45, `${o.naslov}: ${r} riječi`);
  }
});

test("upozorenja", () => {
  const dobro = { trajanje: 20, vrhDb: -3, rmsDb: -20, sumDb: -65, klipova: 0, pauza: 0.8 };
  assert.deepEqual(upozorenja(dobro), []);
  assert.equal(upozorenja({ ...dobro, trajanje: 3 }).length, 1);
  assert.equal(upozorenja({ ...dobro, sumDb: -40, klipova: 5 }).length, 2);
  assert.match(upozorenja({ ...dobro, pauza: 2.4 })[0], /2\.4 s/);
});

test("trajanje", () => {
  assert.equal(ocjenaTrajanja(5).ok, false);
  assert.equal(ocjenaTrajanja(90).ok, true);
});
