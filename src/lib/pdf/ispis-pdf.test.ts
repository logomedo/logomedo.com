import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { napraviPdf, prelomi, smjestiSliku } from "./ispis-pdf.ts";
import { dokumentBiljeznice, dokumentZadatka, slikeDokumenta, velikeSlike, visinaZaglavlja, type RijecPdf } from "./model.ts";
import { podrucje } from "../okviri.ts";
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

test("percepcija: redova koliko stane, bez natpisa, siva slika ima svoj URL", async () => {
  const red = (izmjene: Izmjena[]) => ({ polja: izmjene.map((izmjena) => ({ rijec_id: 1, izmjena })), tocno: [0] });
  const d = dokumentZadatka({ vrsta: "percepcija", naslov: "", uputa: "Prekriži", sadrzaj: { trazi: "razlicitu", stavke: [
    red(["siva", "", "", ""]), red(["zrcalo", "", "", "", "", ""]), red(["lijevo", "", ""]), red(["mala", "", "", ""]), red(["naopako", "", "", "", ""]),
    red(["", "", "siva"]), red(["", "zrcalo", ""]),
  ] } }, rijeci, true);
  assert.deepEqual(d.stranice.map((s) => s.indeksi), [[0, 1, 2, 3, 4], [5, 6]]);
  assert.deepEqual(slikeDokumenta(d).sort(), ["https://cdn.example/1.jpg", "https://cdn.example/1.jpg#siva"]);
  const t = d.stranice[0].tijelo;
  assert.ok(t.vrsta === "percepcija" && t.redovi.flat().every((x) => x.natpis === ""));
  const b = await napraviPdf(d, new Map(), fontovi);
  assert.equal((await PDFDocument.load(b)).getPageCount(), 2);
});

test("samostalan zadatak: na stranicu redova koliko stane (prva ima zaglavlje), PDF ima iste stranice", async () => {
  const stavke = Array.from({ length: 11 }, () => ({ zadana: 1, ponudeno: [2, 3, 4], tocno: 0 }));
  const d = dokumentZadatka({ vrsta: "odabir", naslov: "Uparivanje", uputa: "Zaokruži", sadrzaj: { odnos: "rima", stavke } }, rijeci, true);
  assert.deepEqual(d.stranice.map((s) => (s.tijelo as { redovi: unknown[] }).redovi.length), [4, 5, 2]);
  assert.deepEqual(d.stranice[1].indeksi, [4, 5, 6, 7, 8]);
  assert.equal((await PDFDocument.load(await napraviPdf(d, new Map(), fontovi))).getPageCount(), 3);
  // 7 redova rime: 4 + 3 (ne 3 + 4).
  const r = dokumentZadatka({ vrsta: "odabir", naslov: "Rima", uputa: "Zaokruži sliku koja se rimuje.", sadrzaj: { odnos: "rima", stavke: stavke.slice(0, 7) } }, rijeci, true);
  assert.deepEqual(r.stranice.map((s) => s.indeksi?.length), [4, 3]);
  // Bez riječi ispod slika red je niži, pa stane red više.
  const bez = dokumentZadatka({ vrsta: "odabir", naslov: "Rima", uputa: "Zaokruži", sadrzaj: { odnos: "rima", stavke } }, rijeci, false);
  assert.deepEqual(bez.stranice.map((s) => s.indeksi?.length), [5, 5, 1]);
  const u = dokumentZadatka({ vrsta: "uljez", naslov: "", uputa: "", sadrzaj: { odnos: "rima", stavke: Array.from({ length: 9 }, () => ({ slike: [1, 2, 3, 4], uljez: 0 })) } }, rijeci, true);
  assert.deepEqual(u.stranice.map((s) => (s.tijelo as { redovi: unknown[] }).redovi.length), [4, 5]);
});

test("zaglavlje: procjena visine kao stvarna (Nunito, prijelom po riječima), nikad manja", async () => {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit((await import("@pdf-lib/fontkit")).default);
  const naslovF = await pdf.embedFont(fontovi.naslov), tekstF = await pdf.embedFont(fontovi.tekst);
  const MM = 72 / 25.4;
  const naslovi = ["Rima", "Uparivanje", "Izbaci uljeza: glas R na početku riječi", "MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM", "Vizualna percepcija · pronađi različitu sliku u svakom redu i zaokruži je"];
  const upute = ["Zaokruži", "Zaokruži sliku koja se rimuje sa zadanom slikom. Pazi na zadnji slog!", "W ".repeat(80), "Pogledaj sve slike u redu. Prekriži onu koja se razlikuje od ostalih. Ako ne znaš, pitaj odraslu osobu da ti pročita riječ, pa probaj ponovno."];
  for (const okvir of [null, { rub: "kocke-crvene", masna: null, kutovi: ["a", null, null, null] }] as const) {
    const o = podrucje(okvir as never), sirina = o.sredina ? 140 : o.D - o.L;
    for (const naslov of naslovi) for (const uputa of upute) {
      const redaka = (t: string, f: typeof naslovF, pt: number) => prelomi(t, (x) => f.widthOfTextAtSize(x, pt) / MM, sirina).length;
      const stvarno = redaka(naslov, naslovF, 22) * 22 * 1.25 / MM + 1 + redaka(uputa, tekstF, 13) * 13 * 1.25 / MM + 1 + 10 + 8;
      const procjena = visinaZaglavlja({ naslov, uputa, ime: true }, o);
      assert.ok(procjena >= stvarno - 0.01 && procjena - stvarno < 5, `${naslov} / ${uputa.slice(0, 20)}: ${procjena} ≠ ${stvarno}`);
    }
  }
});

test("povezivanje: previše parova za jednu stranicu → stranice s jednakim brojem, desno samo svoji parovi", () => {
  const parovi = Array.from({ length: 8 }, (_, i) => ({ lijevo: (i % 4) + 1, desno: ((i + 1) % 4) + 1 }));
  const desno_redoslijed = [7, 2, 5, 0, 3, 6, 1, 4];
  const d = dokumentZadatka({ vrsta: "povezivanje", naslov: "", uputa: "Poveži", sadrzaj: { odnos: "rima", parovi, desno_redoslijed } }, rijeci, true);
  assert.deepEqual(d.stranice.map((s) => s.indeksi), [[0, 1, 2, 3], [4, 5, 6, 7]]);
  assert.ok(d.stranice.every((s) => (s.velicina ?? 0) >= 30));
  const t = d.stranice[1].tijelo;
  assert.ok(t.vrsta === "povezivanje" && t.desno.length === 4);
  const m = dokumentZadatka({ vrsta: "povezivanje", naslov: "", uputa: "Poveži", sadrzaj: { odnos: "rima", parovi: parovi.slice(0, 4), desno_redoslijed: [2, 0, 3, 1] } }, rijeci, true);
  assert.equal(m.stranice.length, 1);
});

test("prvi glas: stranica po krugu, slovo i slike bez natpisa", () => {
  const d = dokumentZadatka({ vrsta: "prvi_glas", naslov: "", uputa: "Zaokruži", sadrzaj: { kolo: ["L", "M"], krugovi: [
    { slovo: "L", slike: [1, 2, null, 1], tocno: [0] }, { slovo: null, slike: [1], tocno: [] }, { slovo: "M", slike: [2], tocno: [0] },
  ] } }, [{ id: 1, rijec: "lav", slika: "/a.jpg" }, { id: 2, rijec: "miš", slika: "/b.jpg" }], true);
  assert.equal(d.stranice.length, 2);
  const t = d.stranice[0].tijelo;
  assert.ok(t.vrsta === "prvi_glas" && t.slovo === "L" && t.slike.length === 3 && t.slike.every((x) => x.natpis === ""));
});

test("slogovi: redova koliko stane bez smanjivanja slika (duljina 4 u redu, analiza 3)", () => {
  const rijeci = Array.from({ length: 22 }, (_, i) => ({ id: i + 1, rijec: `r${i}`, slika: null }));
  const slike = rijeci.map((r) => ({ rijec_id: r.id, slogova: 2 }));
  const d = dokumentZadatka({ vrsta: "slogovi", naslov: "", uputa: "", sadrzaj: { nacin: "duljina", krugova: 4, slike } }, rijeci, false);
  assert.deepEqual(d.stranice.map((s) => (s.tijelo as { slike: unknown[] }).slike.length), [16, 6]);
  assert.ok(d.stranice.every((s) => (s.velicina ?? 0) >= 40));
  assert.ok(d.stranice[0].tijelo.vrsta === "slogovi" && d.stranice[0].tijelo.legenda?.length === 2 && d.stranice[0].tijelo.krugova === 0);
  const a = dokumentZadatka({ vrsta: "slogovi", naslov: "", uputa: "", sadrzaj: { nacin: "analiza", krugova: 5, slike } }, rijeci, false);
  assert.deepEqual(a.stranice.map((s) => (s.tijelo as { slike: unknown[] }).slike.length), [9, 9, 4]);
  assert.ok(a.stranice[0].tijelo.vrsta === "slogovi" && a.stranice[0].tijelo.krugova === 5 && !a.stranice[0].tijelo.legenda);
});

test("razvrstavanje: jedna stranica, slike bez natpisa, spremnici s oznakom; 12 slika stane bez smanjivanja ispod 30 mm", async () => {
  const slike = Array.from({ length: 12 }, (_, i) => ({ rijec_id: (i % 4) + 1, kategorija: i % 3 }));
  const d = dokumentZadatka({ vrsta: "razvrstavanje", naslov: "Vreće", uputa: "Razvrstaj", sadrzaj: { pravilo: "prvi_glas", tema: "vrece", kategorije: ["Š", "LJ", null], slike: [...slike, { rijec_id: null, kategorija: 0 }] } }, rijeci, true);
  assert.equal(d.stranice.length, 1);
  const t = d.stranice[0].tijelo;
  assert.ok(t.vrsta === "razvrstavanje" && t.slike.length === 12 && t.slike.every((x) => !x.natpis));
  assert.ok(t.vrsta === "razvrstavanje" && t.kategorije.join() === "Š,LJ,?");
  assert.deepEqual(d.stranice[0].indeksi, Array.from({ length: 12 }, (_, i) => i));
  assert.ok(d.stranice[0].velicina! >= 30, String(d.stranice[0].velicina));
  for (const tema of ["vrece", "kosare", "kutije"] as const) {
    const pdf = await napraviPdf({ ...d, stranice: d.stranice.map((s) => ({ ...s, tijelo: { ...t, tema } as typeof t })) }, new Map(), { ...fontovi, znak: fontovi.naslov });
    assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1);
  }
});

test("koje slovo: okvir po stavci (samo stavke s glasom među slovima), 4 na prvoj stranici, ključ za logopeda, Andika", async () => {
  const ponudeno = ["S", "Š", "Z", "Ž", "C", "A", "LJ", "M", "DŽ", "R"];
  const stavke = Array.from({ length: 12 }, (_, i) => ({ glas: ponudeno[i % 10], ponudeno }));
  const d = dokumentZadatka({ vrsta: "koje_slovo", naslov: "", uputa: "Poslušaj", sadrzaj: { slova: "mala", grafema: 10, stavke: [...stavke, { glas: null, ponudeno: [] }] } }, rijeci, true);
  assert.ok(d.stranice.length >= 3, String(d.stranice.length));
  assert.deepEqual(d.stranice.flatMap((s) => s.indeksi), Array.from({ length: 12 }, (_, i) => i));
  assert.equal(d.stranice[0].indeksi!.length, 4);
  assert.ok(d.stranice.every((s) => s.velicina! >= 46 && s.velicina! <= 62), d.stranice.map((s) => s.velicina).join());
  const t = d.stranice[1].tijelo;
  assert.ok(t.vrsta === "koje_slovo" && t.okviri[0].broj === 5 && t.okviri[0].glas === "C" && t.okviri[0].slova.includes("dž"));
  assert.ok(JSON.stringify(t).includes('"znak":true'));
  const andika = new Uint8Array(readFileSync(new URL("../../../public/fonts/andika-700.ttf", import.meta.url)));
  const pdf = await napraviPdf(d, new Map(), { ...fontovi, znak: andika });
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), d.stranice.length);
});

test("gdje je glas: 3 stupca, redova koliko stane bez smanjivanja; do 4 slike 2 stupca; PDF s krugovima", async () => {
  const slike = Array.from({ length: 12 }, (_, i) => ({ rijec_id: (i % 4) + 1, pozicija: (i % 3) as 0 | 1 | 2 }));
  const d = dokumentZadatka({ vrsta: "pozicija_glasa", naslov: "", uputa: "Gdje čuješ glas Š?", sadrzaj: { glas: "Š", slike: [...slike, { rijec_id: null, pozicija: 0 }] } }, rijeci, true);
  assert.deepEqual(d.stranice.map((s) => (s.tijelo as { slike: unknown[] }).slike.length), [9, 3]);
  assert.ok(d.stranice.every((s) => s.velicina === 46 && s.tijelo.vrsta === "pozicija_glasa" && s.tijelo.stupaca === 3 && s.tijelo.slike.every((x) => !x.natpis)));
  assert.equal((await PDFDocument.load(await napraviPdf(d, new Map(), fontovi))).getPageCount(), 2);
  const m = dokumentZadatka({ vrsta: "pozicija_glasa", naslov: "", uputa: "", sadrzaj: { glas: "Š", slike: slike.slice(0, 4) } }, rijeci, true);
  assert.ok(m.stranice.length === 1 && m.stranice[0].tijelo.vrsta === "pozicija_glasa" && m.stranice[0].tijelo.stupaca === 2 && m.stranice[0].velicina === 56);
});

test("bilježnica: koje slovo 4 okvira po stranici, gdje je glas 9 slika po stranici", () => {
  const ponudeno = ["S", "Š", "Z", "Ž"];
  const d = dokumentBiljeznice({ naslov: "Glasovi" }, [
    { vrsta: "koje_slovo", sadrzaj: { slova: "velika", grafema: 4, stavke: Array.from({ length: 6 }, () => ({ glas: "S", ponudeno })) } },
    { vrsta: "pozicija_glasa", sadrzaj: { glas: "Š", slike: Array.from({ length: 10 }, () => ({ rijec_id: 1, pozicija: 0 as const })) } },
  ], rijeci, 1);
  assert.deepEqual(d.stranice.map((s) => s.tijelo.vrsta), ["koje_slovo", "koje_slovo", "pozicija_glasa", "pozicija_glasa"]);
  assert.match(d.stranice[2].uputa!, /glas Š/);
});
