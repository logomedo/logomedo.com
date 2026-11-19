import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as K from "./konstante.ts";

const korijen = new URL("../../", import.meta.url);
const procitaj = (p: string) => readFileSync(new URL(p, korijen), "utf8");

const CSP_DIREKTIVE = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://cdn.logomedo.com",
  "media-src 'self' https://cdn.logomedo.com",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
];

/** _headers → { putanja: { zaglavlje (mala slova): vrijednost } } */
function pravila(tekst: string): Map<string, Map<string, string>> {
  const m = new Map<string, Map<string, string>>();
  let trenutno: Map<string, string> | undefined;
  for (const red of tekst.split("\n")) {
    if (!red.trim() || red.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(red)) {
      trenutno = new Map();
      assert.ok(!m.has(red.trim()), `pravilo ${red} dvaput`);
      m.set(red.trim(), trenutno);
      continue;
    }
    const i = red.indexOf(":");
    assert.ok(trenutno && i > 0, `neispravan redak: ${red}`);
    trenutno.set(red.slice(0, i).trim().toLowerCase(), red.slice(i + 1).trim());
  }
  return m;
}

test("landing: title ≤ 60 i description ≤ 155 znakova, sve putanje različite", () => {
  assert.equal(K.STRANICE.length, 6);
  for (const s of K.STRANICE) {
    assert.ok(s.naslov.length <= 60, `${s.putanja}: title ${s.naslov.length}`);
    assert.ok(s.opis.length > 50 && s.opis.length <= 155, `${s.putanja}: description ${s.opis.length}`);
    assert.match(s.naslov, /LogoMedo/);
  }
  assert.ok(K.STRANICA_404.naslov.length <= 60);
  assert.equal(new Set(K.STRANICE.map((s) => s.putanja)).size, 6);
});

test("landing: svaka stranica iz STRANICE postoji i prerenderira se, 404 isto", () => {
  for (const s of K.STRANICE) {
    const datoteka = `src/pages/${s.putanja === "/" ? "index" : s.putanja.slice(1)}.astro`;
    assert.match(procitaj(datoteka), /export const prerender = true;/, datoteka);
    assert.match(procitaj(datoteka), new RegExp(`<Okvir putanja="${s.putanja}">`), datoteka);
  }
  assert.match(procitaj("src/pages/404.astro"), /export const prerender = true;/);
  assert.ok(!K.STRANICE.some((s) => /^\/(admin|api|b|cdn)(\/|$)/.test(s.putanja)));
});

test("landing: sitemap ima šest kanonskih URL-ova bez kose crte na kraju i bez 404", () => {
  const xml = K.sitemapXml();
  const loc = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(loc, [
    "https://logomedo.com/",
    "https://logomedo.com/katalog",
    "https://logomedo.com/radni-listici",
    "https://logomedo.com/igre",
    "https://logomedo.com/o-nama",
    "https://logomedo.com/privatnost",
  ]);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.doesNotMatch(xml, /404/);
  assert.equal(K.kanonski("/katalog"), "https://logomedo.com/katalog");
});

test("landing: _headers ima CSP kao zastiti() bez noncea i cache-control samo na HTML putanjama", () => {
  const p = pravila(procitaj("public/_headers"));
  const sve = p.get("/*");
  assert.ok(sve, "nema pravila /*");
  assert.deepEqual(sve.get("content-security-policy")!.split(";").map((d) => d.trim()), CSP_DIREKTIVE);
  assert.doesNotMatch(sve.get("content-security-policy")!, /nonce|unsafe-eval|'unsafe-inline'.*script/);
  assert.equal(sve.get("x-content-type-options"), "nosniff");
  assert.equal(sve.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(sve.get("x-frame-options"), "DENY");
  assert.ok(!sve.has("cache-control"), "cache-control na /* bi se spojio s /_astro/* immutable");
  const html = [...p.keys()].filter((k) => k !== "/*");
  assert.deepEqual(html.sort(), K.STRANICE.map((s) => s.putanja).sort());
  for (const k of html) assert.deepEqual([...p.get(k)!], [["cache-control", "no-cache"]], k);
});

test("landing: CSP u _headers ima iste direktive kao zastiti() u middlewareu (osim noncea)", () => {
  const mw = procitaj("src/middleware.ts");
  const i = mw.indexOf('"content-security-policy"');
  assert.ok(i > 0);
  const izvor = mw.slice(i, mw.indexOf(");", i));
  for (const d of ["default-src 'none'", "style-src 'self' 'unsafe-inline'", "font-src 'self'", "connect-src 'self'", "form-action 'self'", "frame-ancestors 'none'", "base-uri 'none'"]) {
    assert.ok(izvor.includes(d), `middleware nema ${d}`);
  }
  assert.match(izvor, /script-src 'self' 'nonce-/);
});

test("landing: robots.txt zabranjuje /admin, /api i /b i navodi sitemap", () => {
  const redovi = procitaj("public/robots.txt").split("\n").map((r) => r.trim()).filter(Boolean);
  assert.deepEqual(redovi, [
    "User-agent: *",
    "Disallow: /admin",
    "Disallow: /api",
    "Disallow: /b",
    "Sitemap: https://logomedo.com/sitemap.xml",
  ]);
});

test("landing: nema „— S6]” ni u izvoru stranica ni u konstantama; placeholderi su prazni ili stvarni", () => {
  const datoteke = [
    ...readdirSync(new URL("src/landing/", korijen), { recursive: true }).map((f) => `src/landing/${f}`).filter((f) => f.endsWith(".astro")),
    ...K.STRANICE.map((s) => `src/pages/${s.putanja === "/" ? "index" : s.putanja.slice(1)}.astro`),
    "src/pages/404.astro",
  ];
  assert.ok(datoteke.length >= 14, `premalo datoteka: ${datoteke.length}`);
  for (const f of datoteke) assert.doesNotMatch(procitaj(f), /— S6\]|\[(KONTAKT|DEMO|GODINA|IME TVRTKE|DATUM OBJAVE)/, f);
  for (const v of [K.DEMO_URL, K.KONTAKT, K.IME_TVRTKE, K.GODINA, K.DATUM_OBJAVE]) assert.doesNotMatch(v, /S6|\[/);
  assert.ok(K.DEMO_URL === "" || /^\/b\/[a-z0-9-]+$/.test(K.DEMO_URL), "DEMO_URL je /b/<slug>");
  assert.ok(K.KONTAKT === "" || /^(mailto:|https:\/\/)/.test(K.KONTAKT), "KONTAKT je mailto: ili https://");
  assert.ok(K.GODINA === "" || /^20\d\d$/.test(K.GODINA));
});

test("landing: brojke iz odluke 202 i glasovi iz kataloga", () => {
  assert.deepEqual({ ...K.BROJKE }, { glasova: 30, rijeci: "650+", slika: "1300+", stilova: 2, vrstaZadataka: 11, znakova: 90, temaIgre: 2 });
  assert.equal(K.SUGLASNICI.length + K.SAMOGLASNICI.length, K.BROJKE.glasova);
  assert.equal(new Set([...K.SUGLASNICI, ...K.SAMOGLASNICI]).size, 30);
  for (const s of K.ILUSTRACIJE_V1) assert.ok(K.SUGLASNICI.includes(s.glas), s.glas);
});

test("landing: ilustracije V-1 (512, 256), V-26 (256), OG slika i tema.js postoje", () => {
  for (const s of K.ILUSTRACIJE_V1) for (const v of [256, 512]) assert.ok(existsSync(new URL(`public/landing/${s.ime}-${v}.webp`, korijen)), `${s.ime}-${v}`);
  assert.ok(existsSync(new URL("public/landing/mis-256.webp", korijen)));
  const og = readFileSync(new URL("public/landing/og.png", korijen));
  assert.equal(og.subarray(1, 4).toString(), "PNG");
  assert.equal(og.readUInt32BE(16), K.OG.sirina);
  assert.equal(og.readUInt32BE(20), K.OG.visina);
  assert.match(procitaj("public/tema.js"), /localStorage\.getItem\("logomedo-tema"\)/);
});
