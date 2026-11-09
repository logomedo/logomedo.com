import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { napraviPdf, prelomi, smjestiSliku } from "./ispis-pdf.ts";
import { dokumentBiljeznice, dokumentZadatka, slikeDokumenta, velikeSlike, type RijecPdf } from "./model.ts";
import { prazno, type Izmjena } from "../zadaci/vrste.ts";

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

test("scena: pozadina (uspravna ima prednost) i slike ispod, uputa = pitanje", async () => {
  const pozadine = [{ id: 7, uspravno: { url: "https://cdn.example/p-u.jpg" }, vodoravno: { url: "https://cdn.example/p-v.jpg" } }];
  const sadrzaj = { pozadina_id: 7, gumbi: [1, 2, 3, null, 4, 1, 2].map((rijec_id, i) => ({ rijec_id, tocno: i < 3 })) };
  const d = dokumentBiljeznice({ naslov: "Zima" }, [{ vrsta: "scena", uputa: "Što treba pticama?", sadrzaj }], rijeci, 1, pozadine);
  assert.equal(d.stranice.length, 1);
  assert.equal(d.stranice[0].uputa, "Što treba pticama? Zaokruži sve što pripada.");
  const t = d.stranice[0].tijelo;
  assert.ok(t.vrsta === "scena" && t.gumbi.length === 6 && t.pozadina === "https://cdn.example/p-u.jpg");
  assert.deepEqual([...velikeSlike(d)], ["https://cdn.example/p-u.jpg"]);
  // Stvarni JPEG (1×1) kao pozadina: crta se bez greške.
  const jpg = Uint8Array.from(atob("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=="), (c) => c.charCodeAt(0));
  const pdf = await PDFDocument.load(await napraviPdf(d, new Map([["https://cdn.example/p-u.jpg", jpg]]), fontovi));
  assert.equal(pdf.getPageCount(), 2);
});

test("tema proljeće: naslovnica s jabukom, bez kutova", async () => {
  const d = dokumentBiljeznice({ naslov: "Proljeće", tema: "proljece" }, [
    { vrsta: "uljez", sadrzaj: { odnos: "rima", stavke: [{ slike: [1, 2, 3, 4], uljez: 1 }] } },
  ], rijeci, 7);
  assert.equal(d.ukrasi, false);
  assert.equal(d.naslovnica?.uputa, "Za svaki točno riješen red oboji jednu jabuku na stablu.");
  const pdf = await PDFDocument.load(await napraviPdf(d, new Map(), fontovi));
  assert.equal(pdf.getPageCount(), 2);
});

test("percepcija: izmjena okreće sliku oko središta i ostaje u okviru", () => {
  const o = { x: 100, y: 200, w: 50, h: 50 };
  for (const izmjena of ["", "zrcalo", "naopako", "lijevo", "desno", "mala", "siva"] as const) {
    const m = smjestiSliku(400, 200, o, izmjena);   // vodoravna slika 2:1
    const r = (m.kut * Math.PI) / 180, c = Math.round(Math.cos(r)), s = Math.round(Math.sin(r));
    const kutovi = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [m.x + c * u * m.width - s * v * m.height, m.y + s * u * m.width + c * v * m.height]);
    const xs = kutovi.map((k) => k[0]), ys = kutovi.map((k) => k[1]);
    const sred = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    assert.ok(Math.abs(sred[0] - 125) < 1e-9 && Math.abs(sred[1] - 225) < 1e-9, `${izmjena}: središte ${sred}`);
    assert.ok(Math.min(...xs) >= 100 - 1e-9 && Math.max(...xs) <= 150 + 1e-9 && Math.min(...ys) >= 200 - 1e-9 && Math.max(...ys) <= 250 + 1e-9, izmjena);
    // okrenuta za 90° je uspravna: šira strana slike ide okomito
    if (izmjena === "lijevo" || izmjena === "desno") assert.ok(Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs));
  }
  assert.ok(smjestiSliku(400, 200, o, "zrcalo").width < 0);
});

test("percepcija: 4 reda po stranici, bez natpisa, siva slika ima svoj URL", async () => {
  const red = (izmjene: Izmjena[]) => ({ polja: izmjene.map((izmjena) => ({ rijec_id: 1, izmjena })), tocno: [0] });
  const d = dokumentZadatka({ vrsta: "percepcija", naslov: "", uputa: "Prekriži", sadrzaj: { trazi: "razlicitu", stavke: [
    red(["siva", "", "", ""]), red(["zrcalo", "", "", "", "", ""]), red(["lijevo", "", ""]), red(["mala", "", "", ""]), red(["naopako", "", "", "", ""]),
  ] } }, rijeci, true);
  assert.equal(d.stranice.length, 2);
  assert.deepEqual(slikeDokumenta(d).sort(), ["https://cdn.example/1.jpg", "https://cdn.example/1.jpg#siva"]);
  const t = d.stranice[0].tijelo;
  assert.ok(t.vrsta === "percepcija" && t.redovi.flat().every((x) => x.natpis === ""));
  const b = await napraviPdf(d, new Map(), fontovi);
  assert.equal((await PDFDocument.load(b)).getPageCount(), 2);
});

test("samostalan zadatak: prva stranica 3 reda odabira, ostale 4 (bez zaglavlja)", async () => {
  const stavke = Array.from({ length: 11 }, () => ({ zadana: 1, ponudeno: [2, 3, 4], tocno: 0 }));
  const d = dokumentZadatka({ vrsta: "odabir", naslov: "Uparivanje", uputa: "Zaokruži", sadrzaj: { odnos: "rima", stavke } }, rijeci, true);
  assert.deepEqual(d.stranice.map((s) => (s.tijelo as { redovi: unknown[] }).redovi.length), [3, 4, 4]);
  const u = dokumentZadatka({ vrsta: "uljez", naslov: "", uputa: "", sadrzaj: { odnos: "rima", stavke: Array.from({ length: 9 }, () => ({ slike: [1, 2, 3, 4], uljez: 0 })) } }, rijeci, true);
  assert.deepEqual(u.stranice.map((s) => (s.tijelo as { redovi: unknown[] }).redovi.length), [4, 5]);
});

test("prvi glas: stranica po krugu, slovo i slike bez natpisa", () => {
  const d = dokumentZadatka({ vrsta: "prvi_glas", naslov: "", uputa: "Zaokruži", sadrzaj: { kolo: ["L", "M"], krugovi: [
    { slovo: "L", slike: [1, 2, null, 1], tocno: [0] }, { slovo: null, slike: [1], tocno: [] }, { slovo: "M", slike: [2], tocno: [0] },
  ] } }, [{ id: 1, rijec: "lav", slika: "/a.jpg" }, { id: 2, rijec: "miš", slika: "/b.jpg" }], true);
  assert.equal(d.stranice.length, 2);
  const t = d.stranice[0].tijelo;
  assert.ok(t.vrsta === "prvi_glas" && t.slovo === "L" && t.slike.length === 3 && t.slike.every((x) => x.natpis === ""));
});

test("slogovi: duljina s legendom 12 po stranici, analiza s krugovima 9", () => {
  const rijeci = Array.from({ length: 14 }, (_, i) => ({ id: i + 1, rijec: `r${i}`, slika: null }));
  const slike = rijeci.map((r) => ({ rijec_id: r.id, slogova: 2 }));
  const d = dokumentZadatka({ vrsta: "slogovi", naslov: "", uputa: "", sadrzaj: { nacin: "duljina", krugova: 4, slike } }, rijeci, false);
  assert.deepEqual(d.stranice.map((s) => (s.tijelo as { slike: unknown[] }).slike.length), [12, 2]);
  assert.ok(d.stranice[0].tijelo.vrsta === "slogovi" && d.stranice[0].tijelo.legenda?.length === 2 && d.stranice[0].tijelo.krugova === 0);
  const a = dokumentZadatka({ vrsta: "slogovi", naslov: "", uputa: "", sadrzaj: { nacin: "analiza", krugova: 5, slike } }, rijeci, false);
  assert.deepEqual(a.stranice.map((s) => (s.tijelo as { slike: unknown[] }).slike.length), [9, 5]);
  assert.ok(a.stranice[0].tijelo.vrsta === "slogovi" && a.stranice[0].tijelo.krugova === 5 && !a.stranice[0].tijelo.legenda);
});
