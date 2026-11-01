import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { napraviPdf, prelomi } from "./ispis-pdf.ts";
import { dokumentBiljeznice, dokumentZadatka, slikeDokumenta, type RijecPdf } from "./model.ts";
import { prazno } from "../zadaci/vrste.ts";

const fontovi = {
  tekst: new Uint8Array(readFileSync(new URL("../../../public/fonts/nunito-800.ttf", import.meta.url))),
  naslov: new Uint8Array(readFileSync(new URL("../../../public/fonts/nunito-900.ttf", import.meta.url))),
};
const rijeci: RijecPdf[] = [
  { id: 1, rijec: "šešir", slika: "https://cdn.example/1.jpg" },
  { id: 2, rijec: "žižak", slika: null },
  { id: 3, rijec: "čačkalica", slika: "https://cdn.example/3.jpg" },
  { id: 4, rijec: "đak", slika: null },
];

test("bilježnica: naslovnica + stranice po vrsti, hrvatska slova bez greške", async () => {
  const d = dokumentBiljeznice({ naslov: "Božićna rima" }, [
    { vrsta: "odabir", sadrzaj: { odnos: "rima", stavke: Array.from({ length: 4 }, () => ({ zadana: 1, ponudeno: [2, 3, 4], tocno: 0 })) } },
    { vrsta: "uljez", sadrzaj: { odnos: "rima", stavke: [{ slike: [1, 2, 3, 4], uljez: 1 }] } },
    { vrsta: "povezivanje", sadrzaj: { odnos: "rima", parovi: [{ lijevo: 1, desno: 2 }, { lijevo: 3, desno: 4 }, { lijevo: 2, desno: 1 }], desno_redoslijed: [2, 0, 1] } },
  ], rijeci, 12);
  // odabir 4 reda = 2 stranice (3 + 1), uljez 1, povezivanje 1
  assert.equal(d.stranice.length, 4);
  assert.deepEqual(slikeDokumenta(d).sort(), ["https://cdn.example/1.jpg", "https://cdn.example/3.jpg"]);
  // Slike nisu dohvaćene: PDF se svejedno složi (prazni okviri).
  const b = await napraviPdf(d, new Map(), fontovi);
  const pdf = await PDFDocument.load(b);
  assert.equal(pdf.getPageCount(), 5);
  assert.equal(pdf.getTitle(), "Božićna rima");
});

test("samostalan zadatak: listić 12 kartica po stranici", async () => {
  const s = prazno("listic");
  const kartice = Array.from({ length: 14 }, (_, i) => ({ rijec_id: (i % 4) + 1, tekst: i % 2 ? "Što je ovo?" : "" }));
  const d = dokumentZadatka({ vrsta: "listic", naslov: "", uputa: "Oboji", sadrzaj: { ...s, kartice } }, rijeci, true);
  assert.equal(d.stranice.length, 2);
  assert.equal(d.stranice[0].naslov, "Radni listić");
  const pdf = await PDFDocument.load(await napraviPdf(d, new Map(), fontovi));
  assert.equal(pdf.getPageCount(), 2);
});

test("prazan zadatak daje jednu stranicu", async () => {
  const d = dokumentZadatka({ vrsta: "uljez", naslov: "X", uputa: "", sadrzaj: { odnos: "rima", stavke: [] } }, [], false);
  assert.equal((await PDFDocument.load(await napraviPdf(d, new Map(), fontovi))).getPageCount(), 1);
});

test("prelomi", () => {
  assert.deepEqual(prelomi("a bb ccc", (s) => s.length, 4), ["a bb", "ccc"]);
  assert.deepEqual(prelomi("", (s) => s.length, 4), [""]);
});
