import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as K from "./konstante.ts";
import { VRSTE_ZADATAKA } from "./radni-listici/vrste.ts";

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
  assert.equal(K.STRANICE.length, 8);
  for (const s of K.STRANICE) {
    assert.ok(s.naslov.length <= 60, `${s.putanja}: title ${s.naslov.length}`);
    assert.ok(s.opis.length > 50 && s.opis.length <= 155, `${s.putanja}: description ${s.opis.length}`);
    assert.match(s.naslov, /LogoMedo/);
  }
  assert.ok(K.STRANICA_404.naslov.length <= 60);
  assert.equal(new Set(K.STRANICE.map((s) => s.putanja)).size, 8);
});

test("landing: svaka stranica iz STRANICE postoji i prerenderira se (osim ssr: /pristup), 404 isto", () => {
  assert.deepEqual(K.STRANICE.filter((s) => s.ssr).map((s) => s.putanja), [K.PRISTUP]);
  for (const s of K.STRANICE) {
    const datoteka = `src/pages/${s.putanja === "/" ? "index" : s.putanja.slice(1)}.astro`;
    assert.match(procitaj(datoteka), s.ssr ? /export const prerender = false;/ : /export const prerender = true;/, datoteka);
    assert.match(procitaj(datoteka), new RegExp(`<Okvir putanja="${s.putanja}">`), datoteka);
  }
  assert.match(procitaj("src/pages/404.astro"), /export const prerender = true;/);
  assert.ok(!K.STRANICE.some((s) => /^\/(admin|api|b|cdn)(\/|$)/.test(s.putanja)));
});

test("landing: sitemap ima osam kanonskih URL-ova bez kose crte na kraju i bez 404", () => {
  const xml = K.sitemapXml();
  const loc = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(loc, [
    "https://logomedo.com/",
    "https://logomedo.com/katalog",
    "https://logomedo.com/radni-listici",
    "https://logomedo.com/igre",
    "https://logomedo.com/o-nama",
    "https://logomedo.com/pristup",
    "https://logomedo.com/privatnost",
    "https://logomedo.com/uvjeti",
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
  // /pristup je SSR: zaglavlja (CSP s nonceom, cache-control no-store) daju middleware i stranica.
  assert.deepEqual(html.sort(), K.STRANICE.filter((s) => !s.ssr).map((s) => s.putanja).sort());
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
  for (const v of [K.DEMO_URL, K.KONTAKT, K.IME_TVRTKE, K.GODINA, K.GODINA_PRVOG, K.DATUM_OBJAVE, K.VODITELJ_OBRADE]) assert.doesNotMatch(v, /S6|\[/);
  assert.ok(K.DEMO_URL === "" || /^\/b\/[a-z0-9-]+$/.test(K.DEMO_URL), "DEMO_URL je /b/<slug>");
  assert.ok(K.KONTAKT === "" || /^(mailto:|https:\/\/)/.test(K.KONTAKT), "KONTAKT je mailto: ili https://");
  assert.ok(K.GODINA === "" || /^20\d\d$/.test(K.GODINA));
  assert.ok(K.GODINA_PRVOG === "" || /^20\d\d$/.test(K.GODINA_PRVOG));
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
  assert.deepEqual(webpVelicina(readFileSync(new URL(`public${K.ILUSTRACIJA_V25.src}`, korijen))), [512, 512], "V-25 sova");
  const og = readFileSync(new URL("public/landing/og.png", korijen));
  assert.equal(og.subarray(1, 4).toString(), "PNG");
  assert.equal(og.readUInt32BE(16), K.OG.sirina);
  assert.equal(og.readUInt32BE(20), K.OG.visina);
  assert.match(procitaj("public/tema.js"), /localStorage\.getItem\("logomedo-tema"\)/);
});

/** Izvor landinga: sve .astro u src/landing i stranice iz STRANICE + 404. */
function izvorLandinga(): string[] {
  return [
    ...readdirSync(new URL("src/landing/", korijen), { recursive: true }).map((f) => `src/landing/${f}`).filter((f) => f.endsWith(".astro")),
    ...K.STRANICE.map((s) => `src/pages/${s.putanja === "/" ? "index" : s.putanja.slice(1)}.astro`),
    "src/pages/404.astro",
  ];
}

/** Širina i visina WebP-a iz zaglavlja (VP8X, VP8, VP8L). */
function webpVelicina(b: Buffer): [number, number] {
  assert.equal(b.subarray(0, 4).toString(), "RIFF");
  assert.equal(b.subarray(8, 12).toString(), "WEBP");
  const vrsta = b.subarray(12, 16).toString();
  if (vrsta === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (vrsta === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  assert.equal(vrsta, "VP8L");
  const [b0, b1, b2, b3] = b.subarray(21, 25);
  return [1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))];
}

test("landing: nijedna inline skripta ni is:inline u komponentama i stranicama landinga (CSP bez noncea)", () => {
  for (const f of izvorLandinga()) {
    const t = procitaj(f);
    assert.doesNotMatch(t, /is:inline|set:html/, f);
    for (const m of t.matchAll(/<script\b[^>]*>/g)) assert.match(m[0], /\ssrc=/, `${f}: ${m[0]}`);
    assert.doesNotMatch(t, /\son[a-z]+=/, `${f}: inline handler`);
  }
});

test("landing: svaka literalna /landing/*.webp referenca u izvoru ima datoteku", () => {
  const ref = new Set(izvorLandinga().flatMap((f) => [...procitaj(f).matchAll(/\/landing\/[a-z0-9-]+\.webp/g)].map((m) => m[0])));
  for (const r of ref) assert.ok(existsSync(new URL(`public${r}`, korijen)), r);
});

test("landing: V-8 i V-9 (ilustracija + bojanka 512 px) postoje", () => {
  for (const p of K.PAROVI_STILOVA) {
    for (const ime of [`${p.ime}-512`, `${p.ime}-bojanka-512`]) {
      assert.deepEqual(webpVelicina(readFileSync(new URL(`public/landing/${ime}.webp`, korijen))), [512, 512], ime);
    }
  }
});

test("landing: svaka snimka iz SNIMKE postoji u public/landing u pravoj veličini (desktop 1280×800, mobitel 780×1688)", () => {
  const nema: string[] = [];
  for (const v of Object.keys(K.SNIMKE).map(Number) as K.SnimkaId[]) {
    for (const d of K.snimkaDatoteke(v)) {
      for (const [put, vel] of [[d.desktop, K.SNIMKA_DESKTOP], [d.mobitel, K.SNIMKA_MOBITEL]] as const) {
        if (!put) continue;
        const url = new URL(`public${put}`, korijen);
        if (!existsSync(url)) { nema.push(put); continue; }
        assert.deepEqual(webpVelicina(readFileSync(url)), [vel.sirina, vel.visina], put);
      }
    }
  }
  assert.deepEqual(nema, [], `nedostaju snimke: ${nema.join(", ")}`);
});

test("landing: snimke koje izvor koristi su u SNIMKE, a alt nema brojku mimo BROJKE", () => {
  const koristene = new Set(izvorLandinga().flatMap((f) => [...procitaj(f).matchAll(/<Snimka v=\{(\d+)\}/g)].map((m) => Number(m[1]))));
  for (const v of koristene) assert.ok(v in K.SNIMKE, `V-${v} nije u SNIMKE`);
  for (const v of [4, 6, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24]) assert.ok(koristene.has(v), `V-${v} se ne koristi`);
  assert.equal(K.snimkaDatoteke(6).length, 2);
  assert.equal(K.snimkaDatoteke(4)[0].mobitel, undefined);
  assert.deepEqual(K.snimkaDatoteke(21), [{ tamna: false, desktop: undefined, mobitel: "/landing/v21-mobitel.webp" }]);
  assert.match(K.SNIMKE[6].alt, new RegExp(`^Katalog s ${K.BROJKE.glasova} mapa`));
});

test("landing: R-3 ima BROJKE.vrstaZadataka kartica, od toga dvije slušne „u igri uskoro”", () => {
  assert.equal(VRSTE_ZADATAKA.length, K.BROJKE.vrstaZadataka);
  assert.deepEqual(VRSTE_ZADATAKA.filter((z) => z.uskoroUIgri).map((z) => z.naslov), ["Koje slovo čuješ?", "Gdje je glas?"]);
  assert.equal(new Set(VRSTE_ZADATAKA.map((z) => z.naslov)).size, VRSTE_ZADATAKA.length);
});

test("landing: pravne stranice imaju voditelja obrade i pružatelja, bez osobnih kontakata (odluke 600, 607)", () => {
  assert.equal(K.VODITELJ_OBRADE, K.TVRTKA.naziv);
  assert.match(K.TVRTKA.oib, /^\d{11}$/);
  assert.match(K.TVRTKA.mbs, /^\d{9}$/);
  assert.equal(K.TVRTKA.privatnost, "bok@logomedo.com");
  assert.equal(K.KONTAKT, `mailto:${K.TVRTKA.privatnost}`);
  const izvor = ["src/pages/privatnost.astro", "src/pages/uvjeti.astro", ...readdirSync(new URL("src/landing/privatnost/", korijen)).map((f) => `src/landing/privatnost/${f}`),
    ...readdirSync(new URL("src/landing/uvjeti/", korijen)).map((f) => `src/landing/uvjeti/${f}`)].map(procitaj).join("\n");
  for (const id of ["pristup", "voditelj", "osnove", "obradivaci", "kolacici", "cuvanje", "prava", "pruzatelj", "odgovornost"]) assert.match(izvor, new RegExp(`id="${id}"`), id);
  assert.doesNotMatch(izvor, /\+385|gmail\.com|ms@/);
  assert.doesNotMatch(izvor, /besplatn/i);
});

test("landing: zaglavlje ima aktivnu stranicu i prekidač teme bez inline skripte (odluke 608, 609)", () => {
  const z = procitaj("src/landing/Zaglavlje.astro");
  assert.match(z, /aria-current=\{trenutna\(l\.href\)\}/);
  assert.match(z, /<button type="button" class="prekidac-teme gore" aria-label="Tamna tema"/);
  assert.match(z, /class="samo-dan">[\s\S]*?Tamna tema<\/span><span class="samo-noc">[\s\S]*?Svijetla tema<\/span>/);
  assert.match(procitaj("src/landing/Okvir.astro"), /<Podnozje putanja=\{putanja\} \/>/);
  const js = procitaj("public/tema.js");
  assert.match(js, /\.prekidac-teme/);
  assert.match(js, /localStorage\.setItem\("logomedo-tema"/);
  assert.match(js, /tamno\(\) \? "Svijetla tema" : "Tamna tema"/);
});
