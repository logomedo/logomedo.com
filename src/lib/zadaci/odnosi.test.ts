import { test } from "node:test";
import assert from "node:assert/strict";
import { kljuc, oznakaKljuca, poCiljevima, prviSlog, uOdnosu } from "./odnosi.ts";
import { normaliziraj, provjeri, slozi, zadanaUputa, type Odabir, type Povezivanje, type RijecZadatka, type Uljez } from "./vrste.ts";
import { brojSlogova, izvediRimu } from "./rima.ts";

const r = (rijec: string, id = 1) => ({ id, rijec, rima: izvediRimu(rijec) });

test("prvi slog: zatvoreni ili otvoreni, jednosložna riječ cijela, IJE i slogotvorno R", () => {
  assert.equal(prviSlog("mačka"), "MAČ");
  assert.equal(prviSlog("majmun"), "MAJ");
  assert.equal(prviSlog("poštar"), "POŠ");
  assert.equal(prviSlog("mama"), "MA");
  assert.equal(prviSlog("igra"), "I");
  assert.equal(prviSlog("lav"), "LAV");
  assert.equal(prviSlog("lama"), "LA");
  assert.equal(prviSlog("rijeka"), "RIJE");
  assert.equal(prviSlog("krtica"), "KR");
  assert.equal(prviSlog("avion"), "A");
  assert.equal(prviSlog("čarobni štapić"), null);
});

test("prvi i zadnji glas po fonemima (LJ, NJ, DŽ su jedan glas)", () => {
  assert.equal(kljuc("pocetni_glas", r("ljuljačka")), "LJ");
  assert.equal(kljuc("pocetni_glas", r("lopta")), "L");
  assert.equal(kljuc("zavrsni_glas", r("konj")), "NJ");
  assert.equal(kljuc("zavrsni_glas", r("krava")), "A");
  assert.equal(kljuc("pocetni_glas", r("luk-strijela")), null);
  assert.ok(!uOdnosu("pocetni_glas", r("ljuljačka", 1), r("lopta", 2)));
  assert.ok(!uOdnosu("pocetni_slog", r("mačka", 1), r("majmun", 2)));
  assert.ok(uOdnosu("pocetni_slog", r("maca", 1), r("mama", 2)));
  assert.ok(!uOdnosu("pocetni_slog", r("lav", 1), r("lama", 2)));
  assert.ok(!uOdnosu("rima", r("krava", 1), r("krava", 1)));
  assert.equal(oznakaKljuca("pocetni_slog", r("mačka")), "mač-");
  assert.equal(oznakaKljuca("zavrsni_glas", r("konj")), "-nj");
});

const popis = ["mačka", "majmun", "maca", "lopta", "lav", "lama", "list", "pas", "patka", "papiga", "sat", "sova", "sir", "riba", "ruka", "konj", "slon", "vrat", "kruh", "nos", "lampa", "sokol", "mama", "malina", "soba", "paprika"];
const R: RijecZadatka[] = popis.map((x, i) => ({ id: i + 1, rijec: x, rima: izvediRimu(x), slogova: brojSlogova(x), slika: null }));
const M = new Map(R.map((x) => [x.id, x]));
let sjeme = 7;
const rnd = () => ((sjeme = (sjeme * 16807) % 2147483647) / 2147483647);

for (const odnos of ["pocetni_glas", "pocetni_slog", "zavrsni_glas"] as const) {
  test(`generator po odnosu ${odnos}: sva tri predloška prolaze provjeru i nose odnos`, () => {
    const o = slozi("odabir", R, { stavki: 3, nacin: odnos }, rnd) as Odabir;
    assert.equal(o.odnos, odnos);
    assert.ok(o.stavke.length >= 2);
    assert.deepEqual(provjeri("odabir", o, M), []);
    const p = slozi("povezivanje", R, { stavki: 3, nacin: odnos }, rnd) as Povezivanje;
    assert.equal(p.odnos, odnos);
    assert.deepEqual(provjeri("povezivanje", p, M), []);
    const u = slozi("uljez", R, { stavki: 2, nacin: odnos }, rnd) as Uljez;
    assert.equal(u.odnos, odnos);
    assert.ok(u.stavke.length >= 1);
    assert.deepEqual(provjeri("uljez", u, M), []);
  });
}

test("uputa i provjera prate odnos; nepoznat odnos je rima", () => {
  const id = (x: string) => R.find((y) => y.rijec === x)!.id;
  const s: Odabir = { odnos: "pocetni_glas", stavke: [{ zadana: id("lopta"), ponudeno: [id("sat"), id("lav"), id("list")], tocno: 0 }] };
  assert.equal(zadanaUputa("odabir", s), "Koja slika počinje istim glasom kao prva? Zaokruži je.");
  const u = provjeri("odabir", s, M).map((x) => x.poruka);
  assert.ok(u.some((p) => p.includes("SAT ne počinje istim glasom kao LOPTA") || p.includes("ne počinje istim glasom")), u.join(" | "));
  assert.ok(u.some((p) => p.includes("dva točna odgovora")));
  assert.equal((normaliziraj("odabir", { odnos: "smeće", stavke: [] }) as Odabir).odnos, "rima");
  assert.equal((normaliziraj("uljez", { odnos: "zavrsni_glas", stavke: [] }) as Uljez).odnos, "zavrsni_glas");
});

test("po glasovima: jedan red (par) za svaki glas, redom kojim su glasovi odabrani", () => {
  const prvi = (sl: string) => (x: RijecZadatka) => x.rijec.toLocaleUpperCase("hr").startsWith(sl);
  const ciljevi = ["S", "L", "P"].map(prvi);
  const p = slozi("povezivanje", R, { stavki: 3, nacin: "pocetni_glas", ciljevi }, rnd) as Povezivanje;
  assert.deepEqual(p.parovi.map((x) => M.get(x.lijevo!)!.rijec[0].toUpperCase()), ["S", "L", "P"]);
  assert.deepEqual(provjeri("povezivanje", p, M).filter((u) => u.gdje !== "zadatak"), []);
  const o = slozi("odabir", R, { stavki: 4, nacin: "rima", ciljevi: [prvi("M")] }, rnd) as Odabir;
  assert.ok(o.stavke.every((x) => M.get(x.zadana!)!.rijec.startsWith("m")));
});

test("poCiljevima: glas bez skupine se preskače, ostali idu u krug", () => {
  const sk = [["sa", "so"], ["la", "lo"], ["si", "su"]];
  const r = poCiljevima(sk, ["s", "l", "ž"].map((c) => (x: string) => x.startsWith(c)), 4);
  assert.deepEqual(r.map((x) => x.cilj), [0, 1, 0]);
});

test("odabrani glasovi ostaju u sadržaju (editor ih nudi pri biranju slike)", () => {
  const pg = { glasovi: [3, 5], oznake: ["S", "Z"], pozicija: "inicijalna", bez: ["R"] };
  assert.deepEqual((normaliziraj("povezivanje", { odnos: "rima", po_glasovima: pg, parovi: [] }) as Povezivanje).po_glasovima, pg);
  assert.equal((normaliziraj("uljez", { po_glasovima: { glasovi: [], bez: [] }, stavke: [] }) as Uljez).po_glasovima, undefined);
  assert.equal((normaliziraj("odabir", { po_glasovima: { glasovi: [3], oznake: ["S"], pozicija: "svugdje", bez: [] }, stavke: [] }) as Odabir).po_glasovima?.pozicija, "");
});

test("poCiljevima: jedna skupina daje više redova (uljez, prvi glas C)", () => {
  const sk = [["ca", "ce", "ci", "co", "cu", "cr", "cv"]];
  const r = poCiljevima(sk, [(x: string) => x.startsWith("c")], 4, 3);
  assert.equal(r.length, 2);
  assert.equal(new Set(r.flatMap((x) => x.skupina)).size, 6);
});

test("poCiljevima: riječ s glasom ostaje za sljedeći red, nova skupina prije načete", () => {
  // Rima: u skupini -ica samo dvije riječi s C; red uzme jednu s C i jednu bez, pa ostane za drugi red.
  const sk = [["cica", "vica", "mica", "cvica"], ["cesta", "pesta"]];
  const r = poCiljevima(sk, [(x: string) => x.startsWith("c")], 4, 2);
  assert.deepEqual(r.map((x) => x.skupina), [["cica", "vica"], ["cesta", "pesta"], ["cvica", "mica"]]);
});

test("povezivanje po jednom glasu: jedan par s glasom, ostali iz drugih skupina (zadatak 148)", () => {
  const prvi = (sl: string) => (x: RijecZadatka) => x.rijec.toLocaleUpperCase("hr").startsWith(sl);
  const p = slozi("povezivanje", R, { stavki: 4, nacin: "pocetni_glas", ciljevi: [prvi("L")] }, rnd) as Povezivanje;
  const glasovi = p.parovi.map((x) => M.get(x.lijevo!)!.rijec[0].toUpperCase());
  assert.equal(glasovi.filter((g) => g === "L").length, 1);
  assert.equal(new Set(glasovi).size, glasovi.length);
  assert.ok(p.parovi.length >= 2);
  // Dva glasa: parovi istog glasa smiju se ponoviti (L, P, L, P).
  const d = slozi("povezivanje", R, { stavki: 4, nacin: "pocetni_glas", ciljevi: [prvi("L"), prvi("P")] }, rnd) as Povezivanje;
  assert.ok(d.parovi.every((x) => /^[lp]/.test(M.get(x.lijevo!)!.rijec)));
});
