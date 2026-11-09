import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliziraj, ocijeni, provjeri, slikaUStilu, slozi, slozRed, type Izmjena, type Odabir, type Percepcija, type Povezivanje, type RijecZadatka, type Scena, type Uljez } from "./vrste.ts";
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
  assert.deepEqual(provjeri("scena", bez, M).map((u) => u.poruka), ["Nije odabrana situacija.", "Nema ometača: sve slike su točne.", "KRAVA je dvaput."]);
});

test("percepcija: generirani redovi prolaze provjeru u obje varijante", () => {
  for (const trazi of ["razlicitu", "par"] as const)
    for (let n = 3; n <= 6; n++)
      for (let k = 0; k < 20; k++) {
        const s: Percepcija = { trazi, stavke: [slozRed(1, n, trazi, rnd)] };
        assert.equal(s.stavke[0].polja.length, n);
        assert.equal(s.stavke[0].tocno.length, trazi === "par" ? 2 : 1);
        assert.deepEqual(provjeri("percepcija", s, M), [], `${trazi} ${n}: ${JSON.stringify(s)}`);
      }
});

test("percepcija: provjera hvata krivu oznaku i dva para", () => {
  const p = (izmjena: Izmjena) => ({ rijec_id: 1, izmjena });
  const krivo: Percepcija = { trazi: "razlicitu", stavke: [{ polja: [p(""), p(""), p("zrcalo"), p("")], tocno: [0] }] };
  assert.equal(provjeri("percepcija", krivo, M).length, 1);
  const dvaPara: Percepcija = { trazi: "par", stavke: [{ polja: [p(""), p(""), p("siva"), p("siva")], tocno: [0, 1] }] };
  assert.deepEqual(provjeri("percepcija", dvaPara, M).map((u) => u.poruka), ["Osim označenog para postoji još jedan par istih slika."]);
  // Različita može biti i druga riječ (jabuka među kruškama).
  const rijec: Percepcija = { trazi: "razlicitu", stavke: [{ polja: [p(""), { rijec_id: 2, izmjena: "" }, p("")], tocno: [1] }] };
  assert.deepEqual(provjeri("percepcija", rijec, M), []);
});

test("percepcija: normalizacija i ocjena (par traži oba bez krivog dodira)", () => {
  const s = normaliziraj("percepcija", { trazi: "par", stavke: [{ polja: [{ rijec_id: 1, izmjena: "zrcalo" }, { rijec_id: 1, izmjena: "rotiraj" }, { rijec_id: 1, izmjena: "zrcalo" }], tocno: [2, 2, 9] }] }) as Percepcija;
  assert.deepEqual(s.stavke[0].polja.map((x) => x.izmjena), ["zrcalo", "", "zrcalo"]);
  assert.deepEqual(s.stavke[0].tocno, [0, 2]);   // nepotpuna oznaka → iz sadržaja
  assert.equal((normaliziraj("percepcija", { stavke: [{ polja: [] }] }) as Percepcija).stavke[0].polja.length, 3);
  const sest = Array.from({ length: 8 }, () => ({ rijec_id: 1, izmjena: "" }));
  assert.equal((normaliziraj("percepcija", { stavke: [{ polja: sest }] }) as Percepcija).stavke[0].polja.length, 6);
  assert.deepEqual(ocijeni("percepcija", s, [{ stavka: 0, odabrano: 2 }, { stavka: 0, odabrano: 0 }]), { tocnih: 1, ukupno: 1 });
  assert.deepEqual(ocijeni("percepcija", s, [{ stavka: 0, odabrano: 1 }, { stavka: 0, odabrano: 0 }, { stavka: 0, odabrano: 2 }]), { tocnih: 0, ukupno: 1 });
  assert.deepEqual(ocijeni("percepcija", s, [{ stavka: 0, odabrano: 0 }]), { tocnih: 0, ukupno: 1 });
});

test("slikaUStilu: odobrena u stilu, pa odobrena u drugom, pa kandidat", () => {
  const ilu = { src: "/i", ok: true }, boj = { src: "/b", ok: true }, kan = { src: "/k", ok: false };
  assert.equal(slikaUStilu({ ilustracija: ilu, bojanka: boj }, "ilustracija"), "/i");
  assert.equal(slikaUStilu({ ilustracija: ilu, bojanka: boj }, "bojanka"), "/b");
  assert.equal(slikaUStilu({ bojanka: boj }, "ilustracija"), "/b");
  assert.equal(slikaUStilu({ ilustracija: kan, bojanka: boj }, "ilustracija"), "/b");
  assert.equal(slikaUStilu({ ilustracija: kan }, "bojanka"), "/k");
  assert.equal(slikaUStilu({}, "bojanka"), null);
});

test("normaliziraj ne reže 17 redova odabira (zadatak 27 je izgubio 5)", () => {
  const stavke = Array.from({ length: 17 }, (_, i) => ({ zadana: i + 1, ponudeno: [1, 2, 3], tocno: 0 }));
  assert.equal((normaliziraj("odabir", { odnos: "rima", stavke }) as Odabir).stavke.length, 17);
});

// ---- Prvi glas (kolo slova) ----
import { ABECEDA, prviGlas, slozKrug, tocneSlike, type PrviGlas } from "./vrste.ts";
import { ekrani } from "../biljeznice-ekrani.ts";

const PG = ["lav", "lopta", "luk", "list", "ljuljačka", "ljiljan", "nos", "njuška", "konj", "džep", "dupin", "dinja", "čaša", "ćup", "šal", "žaba", "riba", "miš", "sat", "kapa"]
  .map((r, i) => ({ id: 100 + i, rijec: r, rima: null, slogova: brojSlogova(r), slika: `/s/${i}.jpg` }) as RijecZadatka);
const PM = new Map(PG.map((r) => [r.id, r]));

test("prvi glas: dvoslovi su jedan glas", () => {
  assert.equal(ABECEDA.length, 30);
  assert.equal(prviGlas("LJULJAČKA"), "LJ");
  assert.equal(prviGlas("lav"), "L");
  assert.equal(prviGlas("njuška"), "NJ");
  assert.equal(prviGlas("Džep"), "DŽ");
  assert.equal(prviGlas("dupin"), "D");
  assert.equal(prviGlas(""), null);
});

test("prvi glas: krug za L ne broji LJ i prolazi provjeru", () => {
  const k = slozKrug("L", PG, 12, rnd);
  assert.equal(k.slike.length, 12);
  assert.ok(k.tocno.length >= 3 && k.tocno.length <= 4, `L ima 4 riječi: ${k.tocno.length}`);
  for (const j of k.tocno) assert.equal(prviGlas(PM.get(k.slike[j]!)!.rijec), "L");
  assert.equal(new Set(k.slike).size, 12);
  const s: PrviGlas = { kolo: [...ABECEDA], krugovi: [k] };
  assert.deepEqual(provjeri("prvi_glas", s, PM), []);
});

test("prvi glas: generator, normalizacija, ocjena, ekrani", () => {
  const s = slozi("prvi_glas", PG, { stavki: 3 }, rnd) as PrviGlas;
  assert.ok(s.krugovi.length >= 1 && s.krugovi.every((k) => k.slovo && k.tocno.length >= 3));
  const n = normaliziraj("prvi_glas", { kolo: ["A", "X"], krugovi: [{ slovo: "Q", slike: [1, 2, "x"], tocno: [0, 7, -1, 1.5] }] }) as PrviGlas;
  assert.deepEqual(n.kolo, [...ABECEDA]);   // manje od 2 valjana slova: cijela abeceda
  assert.equal(n.krugovi[0].slovo, null);
  assert.equal(n.krugovi[0].slike.length, 12);
  assert.deepEqual(n.krugovi[0].tocno, [0]);
  assert.equal(provjeri("prvi_glas", n, PM)[0].poruka, "Nije odabrano slovo na kojem kolo stane.");
  const k = { slovo: "L", slike: [100, 106, 101, 116], tocno: [] as number[] };
  k.tocno = tocneSlike(k, (id) => PM.get(id)?.rijec);
  assert.deepEqual(k.tocno, [0, 2]);
  const z: PrviGlas = { kolo: ["L", "N"], krugovi: [k] };
  assert.deepEqual(ocijeni("prvi_glas", z, [{ stavka: 0, odabrano: 0 }, { stavka: 0, odabrano: 2 }]), { tocnih: 1, ukupno: 1 });
  assert.deepEqual(ocijeni("prvi_glas", z, [{ stavka: 0, odabrano: 1 }, { stavka: 0, odabrano: 0 }, { stavka: 0, odabrano: 2 }]), { tocnih: 0, ukupno: 1 });
  const e = ekrani([{ vrsta: "prvi_glas", uputa: null, sadrzaj: { kolo: ["L", "N"], krugovi: [k, { slovo: null, slike: [100], tocno: [] }] } }]);
  assert.equal(e.length, 1);
  assert.ok(e[0].vrsta === "prvi_glas" && e[0].uputa.includes("{slovo}"));
});

test("prvi glas: boje kola, nepoznate su šarene", () => {
  assert.equal((normaliziraj("prvi_glas", { boje: "crveno-bijelo-plavo", krugovi: [] }) as PrviGlas).boje, "crveno-bijelo-plavo");
  assert.equal((normaliziraj("prvi_glas", { boje: "zeleno", krugovi: [] }) as PrviGlas).boje, "sareno");
});

// ---- Slogovi ----
import { slozSlogove, jeDuga, zadanaUputa, UPUTE_SLOGOVA, type Slogovi } from "./vrste.ts";

const SL = ["sat", "miš", "krava", "riba", "kapa", "kornjača", "lokomotiva", "televizor", "krokodil", "papiga", "jabuka", "auto"]
  .map((r, i) => ({ id: 200 + i, rijec: r, rima: null, slogova: brojSlogova(r), slika: `/s/${i}.jpg` }) as RijecZadatka);
const SM = new Map(SL.map((r) => [r.id, r]));

test("slogovi: duljina složi pola kratkih i pola dugačkih", () => {
  sjeme = 7;
  const s = slozSlogove("duljina", SL, 8, 4, rnd);
  assert.equal(s.slike.length, 8);
  assert.equal(s.slike.filter((x) => jeDuga(x.slogova)).length, 4);
  assert.equal(new Set(s.slike.map((x) => x.rijec_id)).size, 8);
  assert.deepEqual(provjeri("slogovi", s, SM), []);
});

test("slogovi: analiza ne uzima riječi s više slogova od krugova", () => {
  sjeme = 3;
  const s = slozSlogove("analiza", SL, 8, 3, rnd);
  assert.ok(s.slike.every((x) => x.slogova <= 3));
  assert.ok(new Set(s.slike.map((x) => x.slogova)).size >= 3);
});

test("slogovi: normalizacija, ocjena prvog pokušaja i uputa", () => {
  const s = normaliziraj("slogovi", { nacin: "analiza", krugova: 99, slike: [{ rijec_id: 205, slogova: 3 }, { rijec_id: null, slogova: 0 }, { rijec_id: 200, slogova: 1 }] }) as Slogovi;
  assert.equal(s.krugova, 6);
  assert.equal(s.slike[1].slogova, 1);
  // Slika 0: prvo 2 pa 3 (krivo), slika 2: odmah 1 (točno).
  const o = ocijeni("slogovi", s, [{ stavka: 0, odabrano: 2 }, { stavka: 0, odabrano: 3 }, { stavka: 2, odabrano: 1 }]);
  assert.deepEqual(o, { tocnih: 1, ukupno: 2 });
  const d: Slogovi = { nacin: "duljina", krugova: 4, slike: [{ rijec_id: 205, slogova: 3 }, { rijec_id: 200, slogova: 1 }] };
  assert.deepEqual(ocijeni("slogovi", d, [{ stavka: 0, odabrano: 1 }, { stavka: 1, odabrano: 1 }]), { tocnih: 1, ukupno: 2 });
  assert.equal(zadanaUputa("slogovi", s), UPUTE_SLOGOVA.analiza.ispis);
  assert.match(provjeri("slogovi", { ...s, krugova: 2 }, SM).map((u) => u.poruka).join(" "), /ima 3 sloga, a krugova je 2/);
});

test("slogovi u igri: duljina ravnomjerno po ekranima, analiza slika po ekranu", () => {
  const slike = SL.slice(0, 10).map((r) => ({ rijec_id: r.id, slogova: r.slogova }));
  const e = ekrani([{ vrsta: "slogovi", uputa: UPUTE_SLOGOVA.duljina.ispis, sadrzaj: { nacin: "duljina", krugova: 4, slike } }]);
  assert.deepEqual(e.map((x) => (x.vrsta === "slogovi" ? x.slike.length : 0)), [5, 5]);
  assert.equal(e[0].uputa, UPUTE_SLOGOVA.duljina.ekran);
  assert.equal(ekrani([{ vrsta: "slogovi", uputa: null, sadrzaj: { nacin: "analiza", krugova: 4, slike: [...slike.slice(0, 3), { rijec_id: null, slogova: 1 }] } }]).length, 3);
});

// ---- Radni listić: veličina slika prema broju slika ----
import { rasporedListica } from "./vrste.ts";

test("listić: manje slika, veće slike; 3 × 4 ostaje za stare listiće", () => {
  const m = (n: number) => { const r = rasporedListica(n, "auto", 180, 222); return [r.stupaca, r.redova]; };
  assert.deepEqual(m(1), [1, 1]);
  assert.deepEqual(m(4), [2, 2]);
  assert.deepEqual(m(6), [2, 3]);
  assert.deepEqual(m(12), [3, 4]);
  assert.ok(rasporedListica(4, "auto", 180, 222).s > 2 * rasporedListica(12, "auto", 180, 222).s * 0.9);
  assert.deepEqual([rasporedListica(4, undefined, 180, 222).stupaca, rasporedListica(4, "3x4", 180, 222).redova], [3, 4]);
  assert.equal((normaliziraj("listic", { kartice: [] }) as { raspored?: string }).raspored, "3x4");
  assert.equal((normaliziraj("listic", { kartice: [], raspored: "auto" }) as { raspored?: string }).raspored, "auto");
});
