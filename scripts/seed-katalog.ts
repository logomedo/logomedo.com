// Početni katalog iz starog appa: node scripts/seed-katalog.ts <catalog.csv> > seed/katalog.sql
// Ulaz je ../preuzimanje/data/catalog.csv (kategorija, podrucje, glas, pozicija, rijec,
// naslov_na_listicima, format, koristeno_puta, izvor, stara_putanja).
// Položaji iz starog stabla ulaze kao potvrđeni; ostale pojave istih glasova u riječi
// izvode se iz pravopisa (src/lib/fonemi.ts) kao prijedlog.
import { readFileSync } from "node:fs";
import { pojave, slug, type Pozicija } from "../src/lib/fonemi.ts";

const GLASOVI = [
  { oznaka: "C", slug: "c", skupina: "sibilanti" },
  { oznaka: "S", slug: "s", skupina: "sibilanti" },
  { oznaka: "Z", slug: "z", skupina: "sibilanti" },
  { oznaka: "Č", slug: "ch", skupina: "šuštavci" },
  { oznaka: "Š", slug: "sh", skupina: "šuštavci" },
  { oznaka: "Ž", slug: "zh", skupina: "šuštavci" },
  { oznaka: "L", slug: "l", skupina: "likvidi" },
  { oznaka: "R", slug: "r", skupina: "likvidi", skupine: 1 },
];

const BOJANKA =
  "Children's coloring book page for a speech therapy worksheet. " +
  "Exactly one clearly recognizable {rijec} (Croatian word; {opis}), centered, the whole object visible. " +
  "Clean thick black outlines on a pure white background. No shading, no gray, no color fills, " +
  "no text, no letters, no frame. Simple, friendly shapes a five-year-old can color in. Square 1:1. {napomena}";

const POZ: Record<string, Pozicija> = {
  "Inicijalna pozicija": "inicijalna",
  "Medijalna pozicija": "medijalna",
  "Finalna pozicija": "finalna",
  "Konsonantske skupine": "skupina",
};

const q = (s: string | null | number) => (s === null ? "NULL" : typeof s === "number" ? String(s) : `'${s.replace(/'/g, "''")}'`);

const csv = readFileSync(process.argv[2], "utf8").trim().split("\n").slice(1).map((l) => l.split(","));

interface Rijec { rijec: string; opis: string | null; recenica: string | null; koristeno: number; legacy: Set<string> }

/** Stari nazivi datoteka: „RAME (TIJELO)” → opis, „BRESKVA (2)” i „SAPUN1” → druga slika iste riječi. */
function ocisti(naziv: string): { rijec: string; opis: string | null } {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(naziv);
  const rijec = (m ? m[1] : naziv).replace(/\d+$/, "").trim();
  const opis = m && !/^\d+$/.test(m[2]) ? m[2].toLocaleLowerCase("hr") : null;
  return { rijec: rijec.toLocaleLowerCase("hr"), opis };
}
const rijeci = new Map<string, Rijec>();
for (const [, , glas, pozicija, R, naslov, , koristeno] of csv) {
  const { rijec, opis } = ocisti(R);
  const r = rijeci.get(rijec) ?? { rijec, opis: null, recenica: null, koristeno: 0, legacy: new Set() };
  r.koristeno += Number(koristeno) || 0;
  r.opis ??= opis;
  if (naslov && naslov.toLocaleLowerCase("hr") !== rijec) r.recenica = naslov;
  r.legacy.add(`${glas}|${POZ[pozicija]}`);
  rijeci.set(rijec, r);
}

const out: string[] = ["-- Generirano: scripts/seed-katalog.ts. Ne uređivati ručno.", "PRAGMA foreign_keys = ON;"];
GLASOVI.forEach((g, i) =>
  out.push(`INSERT OR IGNORE INTO glasovi (oznaka, slug, skupina, skupine, redoslijed) VALUES (${q(g.oznaka)}, ${q(g.slug)}, ${q(g.skupina)}, ${g.skupine ?? 0}, ${i + 1});`),
);
out.push(`INSERT OR IGNORE INTO stilovi (kod, naziv, predlozak) VALUES ('bojanka', 'Bojanka', ${q(BOJANKA)});`);

const oznake = GLASOVI.map((g) => g.oznaka);
const sSkupinama = GLASOVI.filter((g) => g.skupine).map((g) => g.oznaka);
let veza = 0, potvrdenih = 0;
for (const r of [...rijeci.values()].sort((a, b) => a.rijec.localeCompare(b.rijec, "hr"))) {
  out.push(
    `INSERT OR IGNORE INTO rijeci (rijec, slug, opis_za_sliku, recenica, legacy_koristeno, izvor) VALUES (${q(r.rijec)}, ${q(slug(r.rijec))}, ${q(r.opis)}, ${q(r.recenica)}, ${r.koristeno}, 'legacy');`,
  );
  const sve = new Map<string, number>();
  for (const p of pojave(r.rijec, oznake, sSkupinama)) sve.set(`${p.glas}|${p.pozicija}`, 0);
  for (const k of r.legacy) sve.set(k, 1);
  for (const [k, potvrdeno] of sve) {
    const [glas, pozicija] = k.split("|");
    out.push(
      `INSERT OR IGNORE INTO rijec_glas (rijec_id, glas_id, pozicija, potvrdeno) SELECT r.id, g.id, ${q(pozicija)}, ${potvrdeno} FROM rijeci r, glasovi g WHERE r.slug = ${q(slug(r.rijec))} AND g.oznaka = ${q(glas)};`,
    );
    veza++; potvrdenih += potvrdeno;
  }
}
console.log(out.join("\n"));
console.error(`${rijeci.size} riječi, ${veza} veza riječ–glas (${potvrdenih} iz starog kataloga, ${veza - potvrdenih} izvedeno)`);
