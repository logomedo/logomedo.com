import { test } from "node:test";
import assert from "node:assert/strict";
import { ekrani, uputaZa } from "./biljeznice-ekrani.ts";

test("ekrani: stavka odabira/uljeza = ekran, povezivanje = jedan, listić se preskače", () => {
  const e = ekrani([
    { vrsta: "odabir", uputa: null, sadrzaj: { odnos: "rima", stavke: [{ zadana: 1, ponudeno: [2, 3, 4], tocno: 0 }, { zadana: 5, ponudeno: [6, 7, 8], tocno: 1 }] } },
    { vrsta: "uljez", uputa: "", sadrzaj: { odnos: "rima", stavke: [{ slike: [1, 2, 3, 4], uljez: 3 }] } },
    { vrsta: "povezivanje", uputa: null, sadrzaj: { odnos: "rima", parovi: [{ lijevo: 1, desno: 2 }, { lijevo: 3, desno: 4 }], desno_redoslijed: [1, 0] } },
    { vrsta: "listic", uputa: null, sadrzaj: { kartice: [{ rijec_id: 1, tekst: "A" }] } },
  ]);
  assert.deepEqual(e.map((x) => x.vrsta), ["odabir", "odabir", "uljez", "povezivanje"]);
  assert.equal(e[2].uputa, "Koja se riječ ne rimuje s ostalima?");
});

test("ekrani: nepotpune stavke se ne broje (inače lampica ostaje neupaljena)", () => {
  const e = ekrani([{ vrsta: "odabir", uputa: null, sadrzaj: { odnos: "rima", stavke: [{ zadana: 1, ponudeno: [2, null, 4], tocno: 0 }] } }]);
  assert.equal(e.length, 0);
});

test("uputaZa: {zadana} velikim slovima", () => {
  assert.equal(uputaZa("Što se rimuje s riječi {zadana}?", "čaj"), "Što se rimuje s riječi ČAJ?");
});

test("ekrani: scena je jedan ekran ako ima pozadinu i barem jednu točnu sliku", () => {
  const e = ekrani([
    { vrsta: "scena", uputa: "Što nam treba?", sadrzaj: { pozadina_id: 1, gumbi: [{ rijec_id: 1, tocno: true }, { rijec_id: 2, tocno: false }] } },
    { vrsta: "scena", uputa: null, sadrzaj: { pozadina_id: null, gumbi: [{ rijec_id: 1, tocno: true }] } },
    { vrsta: "scena", uputa: null, sadrzaj: { pozadina_id: 2, gumbi: [{ rijec_id: null, tocno: true }, { rijec_id: 3, tocno: false }] } },
  ]);
  assert.deepEqual(e.map((x) => [x.vrsta, x.uputa]), [["scena", "Što nam treba?"]]);
});
