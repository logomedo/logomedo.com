import { test } from "node:test";
import assert from "node:assert/strict";
import { mapaRijeci, novoPoljeNapisano, postaviUlogu, ulogaNapisana, ulogeNapisano } from "./napisano.ts";
import { normaliziraj, provjeri, rijeciU, slozi, type Odabir, type Povezivanje, type RijecZadatka, type Uljez } from "./vrste.ts";
import { tijelaZadatka } from "../pdf/model.ts";
import { izvediRimu } from "./rima.ts";

const R: RijecZadatka[] = ["krava", "trava", "glava", "sat", "brat", "miš"].map((r, i) => ({ id: i + 1, rijec: r, rima: izvediRimu(r), slogova: 1, slika: `/s/${r}.png` }));
const ZNAK = { id: 50, rijec: "7", rima: null, slogova: 0, slika: null, znak: true };
const M = mapaRijeci([...R, ZNAK]);

test("mapaRijeci: napisana inačica je ista riječ bez slike, znak je nema", () => {
  assert.deepEqual({ ...M.get(-2), slike: undefined }, { ...R[1], id: -2, slika: null, slike: undefined, napisano: true });
  assert.equal(M.get(1)?.napisano, undefined);
  assert.equal(M.has(-50), false);
});

test("normaliziraj čuva napisana polja, rijeciU daje id riječi", () => {
  const s = normaliziraj("povezivanje", { odnos: "rima", parovi: [{ lijevo: 1, desno: -2 }, { lijevo: 4, desno: -5 }], desno_redoslijed: [1, 0] }) as Povezivanje;
  assert.deepEqual(s.parovi, [{ lijevo: 1, desno: -2 }, { lijevo: 4, desno: -5 }]);
  assert.deepEqual(rijeciU("povezivanje", s), [1, 2, 4, 5]);
  // Listić i ostale vrste i dalje ne primaju negativne id-jeve.
  assert.equal((normaliziraj("scena", { gumbi: [{ rijec_id: -3, tocno: true }] }) as { gumbi: { rijec_id: number | null }[] }).gumbi[0].rijec_id, null);
});

test("provjere odnosa vrijede i za napisane riječi", () => {
  const ok: Odabir = { odnos: "rima", stavke: [{ zadana: 1, ponudeno: [-4, -2, -6], tocno: 1 }] };
  assert.deepEqual(provjeri("odabir", ok, M), []);
  const krivo: Uljez = { odnos: "rima", stavke: [{ slike: [-1, -2, -3, -4], uljez: 0 }] };
  assert.equal(provjeri("uljez", krivo, M).length, 2);
  // Slika i ista riječ napisano: par je u odnosu (KRAVA uz KRAVA), bez upozorenja za par.
  const p: Povezivanje = { odnos: "rima", parovi: [{ lijevo: 1, desno: -1 }, { lijevo: 4, desno: -4 }, { lijevo: 6, desno: -6 }], desno_redoslijed: [0, 1, 2] };
  assert.deepEqual(provjeri("povezivanje", p, M).filter((u) => !u.poruka.includes("(par")), []);
});

test("uloge: desni stupac napisano odjednom, znak ostaje znak", () => {
  const p: Povezivanje = { odnos: "rima", parovi: [{ lijevo: 1, desno: 2 }, { lijevo: 4, desno: 50 }, { lijevo: null, desno: null }], desno_redoslijed: [0, 1, 2] };
  const [lijevo, desno] = ulogeNapisano("povezivanje", p);
  const jeZnak = (id: number) => !!M.get(id)?.znak;
  assert.equal(ulogaNapisana(desno, jeZnak), false);
  postaviUlogu(desno, true, jeZnak);
  assert.deepEqual(p.parovi.map((x) => x.desno), [-2, 50, null]);
  assert.equal(ulogaNapisana(desno, jeZnak), true);
  assert.equal(ulogaNapisana(lijevo, jeZnak), false);
  postaviUlogu(desno, false, jeZnak);
  assert.deepEqual(p.parovi.map((x) => x.desno), [2, 50, null]);
});

test("PDF: napisano polje je riječ Andikom, bez slike i natpisa", () => {
  const s: Odabir = { odnos: "rima", stavke: [{ zadana: -1, ponudeno: [2, 4, 6], tocno: 0 }] };
  const [t] = tijelaZadatka("odabir", s, M, true);
  const z = (t as { redovi: { zadana: unknown }[] }).redovi[0].zadana;
  assert.deepEqual(z, { url: null, rijec: "KRAVA", natpis: "", znak: true, napisano: true });
});

test("Riječ i slika: uparivanje ima napisanu zadanu i njezinu sliku među ponuđenima", () => {
  const s = slozi("odabir", [...R, { ...R[0], id: 9, rijec: "bez slike", slika: null }], { stavki: 4, nacin: "ista_rijec" }) as Odabir;
  assert.equal(s.odnos, "ista_rijec");
  assert.equal(s.stavke.length, 4);
  for (const x of s.stavke) {
    assert.ok(x.zadana! < 0);
    assert.equal(x.ponudeno[x.tocno], -x.zadana!);
    assert.ok(x.ponudeno.every((id) => id! > 0 && id !== 9));
  }
  assert.deepEqual(provjeri("odabir", s, M), []);
  // Ista slika dvaput nije par riječ–slika.
  const krivo: Odabir = { odnos: "ista_rijec", stavke: [{ zadana: 1, ponudeno: [1, 2, 3], tocno: 0 }] };
  assert.equal(provjeri("odabir", krivo, M).length, 1);
});

test("Riječ i slika: povezivanje slika lijevo, ista riječ napisana desno", () => {
  const p = slozi("povezivanje", R, { stavki: 4, nacin: "ista_rijec" }) as Povezivanje;
  assert.equal(p.parovi.length, 4);
  assert.ok(p.parovi.every((x) => x.lijevo! > 0 && x.desno === -x.lijevo!));
  assert.deepEqual(provjeri("povezivanje", p, M), []);
});

test("novi red: prazno polje preuzima oblik uloge (zadatak 141, peti red bio slika)", () => {
  const s: Odabir = { odnos: "ista_rijec", stavke: [
    { zadana: -1, ponudeno: [4, 1, 6], tocno: 1 },
    { zadana: -2, ponudeno: [2, 5, 3], tocno: 0 },
    { zadana: null, ponudeno: [null, null, null], tocno: 0 },
  ] };
  assert.equal(novoPoljeNapisano("odabir", s, "zadana", s.odnos), true);
  assert.equal(novoPoljeNapisano("odabir", s, "ponudeno", s.odnos), false);
  // Mješovita uloga (jedna zadana slika): novo polje je slika.
  s.stavke[1].zadana = 2;
  assert.equal(novoPoljeNapisano("odabir", s, "zadana", s.odnos), false);
  // Prazan zadatak „Riječ i slika”: zadane i desni stupac napisani, ostalo slike.
  const prazno: Povezivanje = { odnos: "ista_rijec", parovi: [{ lijevo: null, desno: null }], desno_redoslijed: [0] };
  assert.equal(novoPoljeNapisano("povezivanje", prazno, "desno", prazno.odnos), true);
  assert.equal(novoPoljeNapisano("povezivanje", prazno, "lijevo", prazno.odnos), false);
  assert.equal(novoPoljeNapisano("povezivanje", { ...prazno, odnos: "rima" }, "desno", "rima"), false);
  // Uljez s napisanim poljima: novo polje napisano.
  const u: Uljez = { odnos: "rima", stavke: [{ slike: [-1, -2, -3, -4], uljez: 0 }, { slike: [null, null, null, null], uljez: 0 }] };
  assert.equal(novoPoljeNapisano("uljez", u, "sve", u.odnos), true);
});
