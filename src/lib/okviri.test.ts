import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { BEZ_OKVIRA, GOTOVI, imaOkvir, normalizirajOkvir, okvirSvg, podrucje, slojevi, type Okvir } from "./okviri.ts";
import { dokumentZadatka, okvirDopusten, slikeDokumenta, type RijecPdf } from "./pdf/model.ts";
import { napraviPdf } from "./pdf/ispis-pdf.ts";
import type { Listic } from "./zadaci/vrste.ts";

const rijeci: RijecPdf[] = [{ id: 1, rijec: "šešir", slika: "https://cdn.example/1.jpg" }, { id: 2, rijec: "lav", slika: "https://cdn.example/2.jpg" }];
const listic = (n: number, raspored: Listic["raspored"]): Listic => ({ kartice: Array.from({ length: n }, (_, i) => ({ rijec_id: (i % 2) + 1, tekst: "" })), raspored });
const KOCKICE = GOTOVI.find((g) => g.kod === "kockice")!.okvir;

test("okvir: nepoznato postaje „bez”, prazan okvir nije okvir", () => {
  assert.deepEqual(normalizirajOkvir("{neispravno"), BEZ_OKVIRA);
  assert.deepEqual(normalizirajOkvir({ rub: "kocke-plave", masna: "zuta", kutovi: ["medo", "zmaj"] }), { rub: "bez", masna: null, kutovi: ["medo", null, null, null] });
  assert.equal(imaOkvir(BEZ_OKVIRA), false);
  assert.equal(okvirSvg(BEZ_OKVIRA), "");
  assert.ok(GOTOVI.every((g) => imaOkvir(g.okvir)));
});

test("okvir: uzorak je unutar ispisivog dijela, ukrasi u kutovima, zaglavlje u sredini kad su gornji kutovi zauzeti", () => {
  const s = slojevi(KOCKICE);
  assert.ok(s.uzorak.length > 20 && s.uzorak.every((p) => p.x >= 5 && p.y >= 5 && p.x + p.w <= 205.01 && p.y + p.h <= 292.01));
  assert.equal(s.slike.length, 4);
  assert.ok(s.kartica);
  assert.equal(podrucje(KOCKICE).sredina, true);
  const p: Okvir = { rub: "pruge-zelene", masna: null, kutovi: [null, null, null, null] };
  assert.equal(podrucje(p).sredina, false);
  assert.ok(podrucje(p).dno > podrucje(KOCKICE).dno);
});

test("okvir: dopušten kad slike ostaju velike, ne kad bi sitne slike bile još manje", () => {
  const z = (s: Listic) => dokumentZadatka({ vrsta: "listic", naslov: "Glas R", uputa: "Imenuj", sadrzaj: s }, rijeci, true);
  assert.equal(okvirDopusten(z(listic(4, "auto")), KOCKICE).dopusten, true);
  const sitno = okvirDopusten(z(listic(30, "5x6")), KOCKICE);
  assert.equal(sitno.dopusten, false);
  assert.ok(sitno.s < sitno.bez);
  // Nedopušten okvir se ne ispisuje ni kad je spremljen.
  assert.equal(dokumentZadatka({ vrsta: "listic", naslov: "", uputa: "", sadrzaj: listic(30, "5x6"), okvir: KOCKICE }, rijeci, true).okvir, undefined);
  // Uparivanje (fiksne mjere) s okvirom i dalje stane.
  const odabir = dokumentZadatka({ vrsta: "odabir", naslov: "", uputa: "", sadrzaj: { odnos: "rima", stavke: Array.from({ length: 3 }, () => ({ zadana: 1, ponudeno: [2, 1, 2], tocno: 0 })) } }, rijeci, true);
  assert.equal(okvirDopusten(odabir, KOCKICE).dopusten, true);
});

test("okvir: PDF s okvirom i ukrasima (PNG s prozirnošću) se složi", async () => {
  const d = dokumentZadatka({ vrsta: "listic", naslov: "Božić", uputa: "Imenuj", sadrzaj: listic(6, "auto"), okvir: KOCKICE }, rijeci, true);
  assert.ok(d.okvir);
  const ukrasi = slikeDokumenta(d).filter((u) => u.startsWith("/okviri/"));
  assert.equal(ukrasi.length, 4);
  const slike = new Map(ukrasi.map((u) => [u, new Uint8Array(readFileSync(new URL(`../../public${u}`, import.meta.url)))]));
  const fontovi = {
    tekst: new Uint8Array(readFileSync(new URL("../../public/fonts/nunito-800.ttf", import.meta.url))),
    naslov: new Uint8Array(readFileSync(new URL("../../public/fonts/nunito-900.ttf", import.meta.url))),
  };
  const pdf = await PDFDocument.load(await napraviPdf(d, slike, fontovi));
  assert.equal(pdf.getPageCount(), 1);
});
