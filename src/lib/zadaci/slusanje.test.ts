import { test } from "node:test";
import assert from "node:assert/strict";
import { GLASOVI, glasIzKljuca, jeKljucGlasa, kljucGlasa, pozicijaGlasa, prikazSlova, razbaci, slicnaSlova, slozPonudeno } from "./slusanje.ts";
import { ABECEDA, normaliziraj, ocijeni, provjeri, slozi, type KojeSlovo, type PozicijaGlasa, type RijecZadatka } from "./vrste.ts";
import { brojSlogova, izvediRimu } from "./rima.ts";
import { ekrani } from "../biljeznice-ekrani.ts";

let s0 = 7;
const rnd = () => ((s0 = (s0 * 16807) % 2147483647) / 2147483647);

test("abeceda slušnih vrsta je ista kao ABECEDA", () => assert.deepEqual(GLASOVI, ABECEDA));

test("ključ snimke glasa: /s/, /dž/; tekst riječi nije ključ glasa", () => {
  assert.equal(kljucGlasa("DŽ"), "/dž/");
  assert.ok(jeKljucGlasa("/š/") && jeKljucGlasa("/lj/"));
  assert.ok(!jeKljucGlasa("sat") && !jeKljucGlasa("/sat/"));
  assert.equal(glasIzKljuca("/nj/"), "NJ");
  assert.equal(prikazSlova("DŽ", "mala"), "dž");
});

test("pozicija glasa: početak, sredina, kraj; dvaput ili nema → null; LJ je jedan glas", () => {
  assert.equal(pozicijaGlasa("S", "SAT"), 0);
  assert.equal(pozicijaGlasa("S", "OSA"), 1);
  assert.equal(pozicijaGlasa("S", "NOS"), 2);
  assert.equal(pozicijaGlasa("L", "LULA"), null);
  assert.equal(pozicijaGlasa("R", "SAT"), null);
  assert.equal(pozicijaGlasa("L", "LJULJAČKA"), null);
  assert.equal(pozicijaGlasa("LJ", "KLJUČ"), 1);
  assert.equal(pozicijaGlasa("S", "SAT LAV"), null);
});

test("ponuđena slova: glas jednom, bez ponavljanja, slična prva u izboru", () => {
  for (const g of ABECEDA) {
    const p = slozPonudeno(g, 10, rnd);
    assert.equal(p.length, 10);
    assert.equal(p.filter((x) => x === g).length, 1);
    assert.equal(new Set(p).size, 10);
  }
  assert.ok(slicnaSlova("S").includes("Š"));
  assert.ok(slozPonudeno("S", 4, rnd).filter((x) => slicnaSlova("S").includes(x)).length === 3);
});

test("razbacana slova: deterministično, unutar okvira, bez preklapanja ćelija", () => {
  const a = razbaci(12, "x"), b = razbaci(12, "x");
  assert.deepEqual(a, b);
  assert.notDeepEqual(razbaci(12, "y").mjesta, a.mjesta);
  for (const m of a.mjesta) { assert.ok(m.x > 0 && m.x < 1 && m.y > 0 && m.y < 1); assert.ok(Math.abs(m.kut) <= 18); }
  assert.ok(a.stupaca * a.redova >= 12);
});

const popis = ["sat", "sok", "sir", "osa", "kosa", "vesta", "nos", "pas", "kokos", "lula", "lav", "riba"];
const R: RijecZadatka[] = popis.map((r, i) => ({ id: i + 1, rijec: r, rima: izvediRimu(r), slogova: brojSlogova(r), slika: "x" }));
const M = new Map(R.map((r) => [r.id, r]));

test("pozicija glasa: generator za S slaže ravnomjerno i prolazi provjeru", () => {
  const s = slozi("pozicija_glasa", R, { stavki: 6, slova: ["S"] }, rnd) as PozicijaGlasa;
  assert.equal(s.glas, "S");
  assert.equal(s.slike.length, 6);
  assert.deepEqual([0, 1, 2].map((p) => s.slike.filter((x) => x.pozicija === p).length), [2, 2, 2]);
  assert.deepEqual(provjeri("pozicija_glasa", s, M), []);
  // KOKOS (dva K, ali jedan S) je dobar za S; LULA nije za L.
  const krivo: PozicijaGlasa = { glas: "L", slike: [{ rijec_id: 10, pozicija: 0 }, { rijec_id: 11, pozicija: 2 }] };
  const u = provjeri("pozicija_glasa", krivo, M).map((x) => x.poruka);
  assert.ok(u.some((x) => x.includes("LULA") && x.includes("2 puta")), u.join("\n"));
  assert.ok(u.some((x) => x.includes("LAV") && x.includes("na početku")), u.join("\n"));
});

test("pozicija glasa: bez zadanog glasa generator bira glas s riječima", () => {
  const s = slozi("pozicija_glasa", R, { stavki: 6 }, rnd) as PozicijaGlasa;
  assert.ok(s.glas);
  assert.ok(s.slike.length >= 3);
  assert.deepEqual(provjeri("pozicija_glasa", s, M), []);
});

test("pozicija glasa: normalizacija, ocjena prvog dodira, ekran po slici", () => {
  const s = normaliziraj("pozicija_glasa", { glas: "S", slike: [{ rijec_id: 1, pozicija: 0 }, { rijec_id: 7, pozicija: 9 }, { rijec_id: null, pozicija: 1 }] }) as PozicijaGlasa;
  assert.deepEqual(s.slike.map((x) => x.pozicija), [0, 0, 1]);
  assert.equal((normaliziraj("pozicija_glasa", { glas: "X" }) as PozicijaGlasa).glas, null);
  assert.deepEqual(ocijeni("pozicija_glasa", s, [{ stavka: 0, odabrano: 0 }, { stavka: 1, odabrano: 2 }, { stavka: 1, odabrano: 0 }]), { tocnih: 1, ukupno: 2 });
  const e = ekrani([{ vrsta: "pozicija_glasa", uputa: null, sadrzaj: s }]);
  assert.equal(e.length, 2);
  assert.equal(e[0].uputa, "Gdje čuješ ovaj glas u riječi?");
});

test("koje slovo: generator po glasovima, provjera, ocjena, ekrani", () => {
  const s = slozi("koje_slovo", [], { stavki: 3, slova: ["S", "Š"] }, rnd) as KojeSlovo;
  assert.deepEqual(s.stavke.map((x) => x.glas), ["S", "Š", "S"]);
  assert.deepEqual(provjeri("koje_slovo", s, new Map()), []);
  const n = normaliziraj("koje_slovo", { slova: "mala", grafema: 99, stavke: [{ glas: "S", ponudeno: ["A", "A", "Q", "B", "C"] }] }) as KojeSlovo;
  assert.deepEqual(n.stavke[0].ponudeno, ["A", "B", "C"]);
  assert.equal(n.grafema, 16);
  assert.equal(n.slova, "mala");
  const u = provjeri("koje_slovo", n, new Map()).map((x) => x.poruka);
  assert.ok(u.some((x) => x.includes("nema slova S")) && u.some((x) => x.includes("samo 3 slova")));
  const t = s.stavke[0].ponudeno.indexOf("S");
  assert.deepEqual(ocijeni("koje_slovo", s, [{ stavka: 0, odabrano: t }, { stavka: 1, odabrano: s.stavke[1].ponudeno.indexOf("Š") === 0 ? 1 : 0 }]), { tocnih: 1, ukupno: 3 });
  const e = ekrani([{ vrsta: "koje_slovo", uputa: null, sadrzaj: n }, { vrsta: "koje_slovo", uputa: null, sadrzaj: s }]);
  assert.equal(e.length, 3);
  assert.equal(e[0].uputa, "Koje slovo čuješ?");
});
