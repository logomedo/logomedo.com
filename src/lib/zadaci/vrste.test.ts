import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliziraj, ocijeni, provjeri, slozi, type Odabir, type Povezivanje, type RijecZadatka, type Scena, type Uljez } from "./vrste.ts";
import { brojSlogova, izvediRimu } from "./rima.ts";

const popis = ["krava", "trava", "glava", "dabar", "ormar", "pehar", "lonac", "palac", "madrac", "sat", "brat", "vrat", "miš", "kiš", "riba", "lisica"];
const R: RijecZadatka[] = popis.map((r, i) => ({ id: i + 1, rijec: r, rima: izvediRimu(r), slogova: brojSlogova(r), slika: null }));
const M = new Map(R.map((r) => [r.id, r]));
const id = (r: string) => R.find((x) => x.rijec === r)!.id;
let sjeme = 1;
const rnd = () => ((sjeme = (sjeme * 16807) % 2147483647) / 2147483647);

test("generator: odabir ima točno jedan točan odgovor po redu", () => {
  const s = slozi("odabir", R, { stavki: 4 }, rnd) as Odabir;
  assert.equal(s.stavke.length, 4);
  assert.deepEqual(provjeri("odabir", s, M), []);
});

test("generator: uljez i povezivanje prolaze provjeru", () => {
  const u = slozi("uljez", R, { stavki: 3 }, rnd) as Uljez;
  assert.ok(u.stavke.length >= 3);
  assert.deepEqual(provjeri("uljez", u, M), []);
  const p = slozi("povezivanje", R, { stavki: 4 }, rnd) as Povezivanje;
  assert.equal(p.parovi.length, 4);
  assert.deepEqual(provjeri("povezivanje", p, M), []);
  assert.notDeepEqual(p.desno_redoslijed, [0, 1, 2, 3]);
});

test("provjera: distraktor koji se rimuje je dva točna odgovora", () => {
  const s: Odabir = { odnos: "rima", stavke: [{ zadana: id("krava"), ponudeno: [id("trava"), id("glava"), id("sat")], tocno: 0 }] };
  assert.match(provjeri("odabir", s, M)[0].poruka, /dva točna/);
});

test("ocjena: broji se prvi pokušaj", () => {
  const s: Odabir = { odnos: "rima", stavke: [
    { zadana: id("krava"), ponudeno: [id("sat"), id("trava"), id("miš")], tocno: 1 },
    { zadana: id("dabar"), ponudeno: [id("ormar"), id("riba"), id("lonac")], tocno: 0 },
  ] };
  assert.deepEqual(ocijeni("odabir", s, [{ stavka: 0, odabrano: 0 }, { stavka: 0, odabrano: 1 }, { stavka: 1, odabrano: 0 }]), { tocnih: 1, ukupno: 2 });
  const p: Povezivanje = { odnos: "rima", parovi: [{ lijevo: 1, desno: 2 }, { lijevo: 4, desno: 5 }], desno_redoslijed: [1, 0] };
  assert.deepEqual(ocijeni("povezivanje", p, [{ lijevo: 0, desno: 1 }, { lijevo: 1, desno: 1 }]), { tocnih: 1, ukupno: 2 });
});

test("normalizacija odbacuje smeće i dopunjava slotove", () => {
  const s = normaliziraj("uljez", { stavke: [{ slike: [1, "x", -3], uljez: 9 }], zlo: 1 }) as Uljez;
  assert.deepEqual(s, { odnos: "rima", stavke: [{ slike: [1, null, null, null], uljez: 0 }] });
  const p = normaliziraj("povezivanje", { parovi: [{ lijevo: 1, desno: 2 }, { lijevo: 3, desno: 4 }], desno_redoslijed: [0, 0] }) as Povezivanje;
  assert.deepEqual(p.desno_redoslijed, [0, 1]);
});

test("scena: normalizacija, provjera i ocjena po gumbu", () => {
  const s = normaliziraj("scena", { pozadina_id: 3, gumbi: [{ rijec_id: 1, tocno: true }, { rijec_id: 2, tocno: "da" }, { rijec_id: 3, tocno: false }, { rijec_id: null, tocno: true }], x: 1 }) as Scena;
  assert.deepEqual(s, { pozadina_id: 3, gumbi: [{ rijec_id: 1, tocno: true }, { rijec_id: 2, tocno: false }, { rijec_id: 3, tocno: false }, { rijec_id: null, tocno: true }] });
  assert.deepEqual(provjeri("scena", s, M).map((u) => u.poruka), ["1 gumb(a) bez slike: u igri se ne prikazuju."]);
  // točan dirnut, jedan ometač dirnut, drugi nije; prazan gumb se ne broji
  assert.deepEqual(ocijeni("scena", s, [{ gumb: 0 }, { gumb: 2 }]), { tocnih: 2, ukupno: 3 });
  assert.deepEqual(ocijeni("scena", s, [{ gumb: 0 }]), { tocnih: 3, ukupno: 3 });
  const bez = normaliziraj("scena", { gumbi: [{ rijec_id: 1, tocno: true }, { rijec_id: 1, tocno: true }] }) as Scena;
  assert.deepEqual(provjeri("scena", bez, M).map((u) => u.poruka), ["Nije odabrana pozadina.", "Nema ometača: sve slike su točne.", "KRAVA je dvaput."]);
});
