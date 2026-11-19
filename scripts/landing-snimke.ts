// Snimke zaslona sa staginga za landing stranice (docs/landing/sadrzaj.md, „4. Popis vizuala”).
// Samo staging.logomedo.com, kao logoped (bez superadmina); produkciju skripta ne zna ni adresirati.
//
//   node scripts/landing-snimke.ts                 # sve snimke
//   node scripts/landing-snimke.ts V-2 V-7         # samo te
//   node scripts/landing-snimke.ts --pripremi      # jednom: probni zadaci, bilježnice i slika za pregled (vidi dolje)
//   node scripts/landing-snimke.ts --pregled       # nova slika-kandidat za V-10 (PREGLED), stara se odbije na stagingu
//   node scripts/landing-snimke.ts --rime          # samo upiše fiksne rime (RIME) u postojeći zadatak „Rima”
//
// Prijava: kolačić sesije iz env LOGOMEDO_KOLACIC ili ~/.cache/logomedo-staging/kolacic (samo vrijednost,
// `scripts/staging-sesija.sh <email> | head -1 | cut -d= -f2`). Probni podaci (ID-jevi, slugovi) su u
// ~/.cache/logomedo-staging/probni.json, izvan repoa. E-mail, kolačić, slugovi i ID-jevi se ne ispisuju.
// Preglednik je sustavni Google Chrome (playwright-core, channel "chrome"): ništa se ne preuzima.
// PNG ide u privremeni dir, pa `cwebp -q 80 -m 6 -metadata none` u public/landing/v<N>-<uređaj>[-tamna].webp.
//
// Slike riječi: admin ih čita s /admin/slika/<id> iz privatnog R2, koji je na stagingu prazan (docs/staging.md). Zato
// skripta jednom pročita `id → r2_kljuc` odobrenih slika iz staging D1 (wrangler, samo čitanje) i te zahtjeve u pregledniku
// posluži s cdn.logomedo.com/<ključ>: iste slike koje admin na produkciji pokazuje. Kandidati (npr. probna slika za
// pregled) idu normalno na staging.
//
// --pripremi (nakon svakog `scripts/staging-osvjezi.sh`, jer osvježavanje briše staging podatke) kroz iste HTTP forme
// kao admin UI napravi: listić „Glas R na početku” (dva: bez okvira i s okvirom), „Prvi glas” (kolo slova),
// „Prebrajanje slogova”, „Rima”, „Izbaci uljeza”, „Isti prvi glas”, scenu „Pečemo kolačiće”, bilježnice „Zimska
// bilježnica” (Božić) i „Proljetna bilježnica” (Proljeće), javne, i jednu sliku-kandidata za /admin/pregled (malo
// izmijenjena kopija odobrene ilustracije cirkusa s cdn.logomedo.com, učitana kao upload). Ne generira ništa (Vertex, ElevenLabs, runner).
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const HOST = "https://staging.logomedo.com";
const KOLACIC = "__Host-logomedo_admin";
const CACHE = join(homedir(), ".cache", "logomedo-staging");
const PROBNI = join(CACHE, "probni.json");
const IZLAZ = join(import.meta.dirname, "..", "public", "landing");

type Uredaj = "desktop" | "mobitel";
type Tema = "svijetla" | "tamna";
interface Probni {
  zadaci: { listic: number; listicOkvir: number; prviGlas: number; slogovi: number; rima: number; uljez: number; istiGlas: number; scena: number };
  biljeznice: { zimska: { id: number; slug: string }; proljetna: { id: number; slug: string } };
  slikaPregleda: number | null;
}

/** Na svakoj admin snimci: blok računa u bočnoj traci (title s e-mailom, avatar, e-mail, uloga). */
const ADMIN = [".tko"];

/**
 * Na svakoj admin snimci maknuto (display: none), landing odluka 204: bez „AI”, naziva servisa i brojeva limita.
 * Kvota u bočnoj traci (i na mobitelu u gornjoj traci), poruka kvote, izgovor i generiranje (zaglavlje zadatka, panel
 * Izgovor bilježnice, „Generiraj … bez slike” na glasu, izbornik Izgovor), „Prompt” na pregledu, brojke kataloga
 * „u redu za generiranje” i „neuspjelih generiranja”. Model u podnaslovu kataloga briše `bezModela`.
 */
const ADMIN_MAKNI = [
  ".kvota-stanje", ".kvota-poruka", "form.z-izgovor", ".z-poruka", "#zvukovi", "details.prompt",
  'form[action="/admin/api/generiraj"]', 'a[href="/admin/zvukovi"]', ".brojke > .brojka:nth-child(n+3)",
];
const CSS_ADMIN = `${ADMIN_MAKNI.join(",")}{display:none!important}.raspored:has(> #zvukovi){grid-template-columns:minmax(0,1fr)!important}`;

/** Vidljivi tekst snimke ne smije spominjati AI, prompt, servise ni limit (odluka 204). */
const ZABRANJENO = /\b(AI|prompt|ElevenLabs|Vertex|Gemini|STT)\b|Preostalo/i;

/** Katalog: „659 riječi · model gemini-…” → „659 riječi”. */
async function bezModela(page: Page) {
  await page.evaluate(() => {
    for (const p of document.querySelectorAll<HTMLElement>(".podnaslov")) {
      const m = p.querySelector(".mono");
      if (!m || !/·\s*model\s*$/.test(m.previousSibling?.textContent ?? "")) continue;
      m.previousSibling!.textContent = m.previousSibling!.textContent!.replace(/\s*·\s*model\s*$/, "");
      m.remove();
    }
  });
}

interface Snimka {
  id: string;                       // V-2
  uredaji: Uredaj[];
  teme?: Tema[];                    // zadano svijetla
  putanja: (p: Probni) => string;   // na stagingu; bez ID-jeva u izvještaju
  izvor: string;                    // za zapis (bez ID-jeva i sluga)
  sakrij: string[];                 // CSS selektori: visibility hidden
  priprema?: (page: Page, p: Probni, u: Uredaj) => Promise<void>;
  kao?: string;                     // svijetla varijanta je ista datoteka kao ova snimka (npr. V-6 = V-2)
  alt: string;
}

const brojV = (id: string) => id.replace(/^V-/, "");
const CDN = "https://cdn.logomedo.com";
const RACUN = "7dc7167b7e2e00923bfa7cd697df14e4"; // D.O.M. (isti kao u package.json)

// ---------- Priprema stranica ----------

/** Mobitel: mape glasova odmah ispod vrha (iznad su brojke kataloga). */
async function doMapa(page: Page, _p: Probni, u: Uredaj) {
  if (u !== "mobitel") return;
  await page.evaluate(() => {
    const el = document.querySelector("nav.podjela-prekidac");
    if (el) scrollTo(0, el.getBoundingClientRect().top + scrollY - 84);
  });
  await page.waitForTimeout(300);
}

/** V-23: cijela naslovnica A4 (794×1123) smanjena da stane u 1280×800, na vrhu ekrana; ostale stranice skrivene. */
async function naslovnica(page: Page) {
  await page.addStyleTag({ content: "article.a4:not(.naslovnica){display:none!important}article.a4.naslovnica{zoom:.66}" });
  await page.evaluate(() => {
    const el = document.querySelector("article.a4.naslovnica");
    if (el) scrollTo(0, el.getBoundingClientRect().top + scrollY - (innerHeight - el.getBoundingClientRect().height) / 2);
  });
  await page.waitForTimeout(300);
}

/** „Po glasovima…” na kartici Radni listić, glas R, inicijalna pozicija. */
async function dijalogPoGlasovima(page: Page) {
  await page.click("button[data-po-glasovima=listic]");
  const d = page.locator("#glas-dijalog");
  await d.waitFor({ state: "visible" });
  await d.locator("label.cip", { has: page.locator("input[name=glas]"), hasText: /^R$/ }).first().click();
  await d.locator("select[name=pozicija]").selectOption("inicijalna");
  await page.waitForTimeout(300);
}

/** Igra: „Kreni”, pa riješi n ekrana (odabir i uljez: dodiruje kartice dok jedna ne bude točna). */
async function igra(page: Page, n: number) {
  await page.click(".gumb-kreni");
  await page.waitForSelector("#igra .kartica, .kartica", { timeout: 15000 });
  for (let i = 0; i < n; i++) if (!(await rijesiEkran(page))) break;
  await page.waitForTimeout(400);
}

async function rijesiEkran(page: Page): Promise<boolean> {
  await page.waitForTimeout(500);
  const kartice = page.locator(".red .kartica");
  const broj = await kartice.count();
  for (let j = 0; j < broj; j++) {
    await kartice.nth(j).click();
    await page.waitForTimeout(250);
    if (await page.evaluate(() => !!document.querySelector(".zakljucano"))) {
      await page.waitForFunction(() => !document.querySelector(".zakljucano"), null, { timeout: 5000 });
      return true;
    }
  }
  return false;
}

async function doKraja(page: Page) {
  await page.click(".gumb-kreni");
  for (let i = 0; i < 40 && !(await page.locator(".bravo").count()); i++) if (!(await rijesiEkran(page))) break;
  await page.waitForSelector(".bravo", { timeout: 5000 });
  await page.waitForTimeout(1500);
}

// ---------- Popis snimki (alt iz sadrzaj.md, odjeljak 4) ----------

const SNIMKE: Snimka[] = [
  { id: "V-2", uredaji: ["desktop", "mobitel"], putanja: () => "/admin?stil=ilustracija", izvor: "/admin?stil=ilustracija", sakrij: ADMIN, priprema: doMapa,
    alt: "Katalog u LogoMedu: mape glasova s brojem riječi u svakoj." },
  { id: "V-3", uredaji: ["desktop", "mobitel"], putanja: (p) => `/admin/zadaci/${p.zadaci.listic}#ispis`, izvor: "/admin/zadaci/<id>#ispis (listić Glas R na početku)", sakrij: ADMIN,
    alt: "Radni listić za glas R na početku riječi, spreman za ispis na A4." },
  { id: "V-4", uredaji: ["desktop"], putanja: (p) => `/b/${p.biljeznice.zimska.slug}`, izvor: "/b/<slug> (Zimska bilježnica, Božić), 2 ekrana riješena", sakrij: [],
    priprema: (page) => igra(page, 2), alt: "Igra za dijete na tabletu: zadatak sa slikama i bor s lampicama." },
  { id: "V-6", uredaji: ["desktop", "mobitel"], teme: ["svijetla", "tamna"], kao: "V-2", putanja: () => "/admin?stil=ilustracija", izvor: "/admin?stil=ilustracija", sakrij: ADMIN, priprema: doMapa,
    alt: "Katalog s 30 mapa glasova, u stilu ilustracije." },
  { id: "V-7", uredaji: ["desktop", "mobitel"], putanja: () => "/admin/glas/r?stil=ilustracija", izvor: "/admin/glas/r?stil=ilustracija", sakrij: ADMIN,
    alt: "Riječi s glasom R razvrstane po poziciji: početak, sredina, kraj i skupine." },
  { id: "V-10", uredaji: ["desktop"], putanja: () => "/admin/pregled", izvor: "/admin/pregled (kao logoped, vlastita probna slika)", sakrij: [...ADMIN, "form.filtar-korisnika", "#korisnik", "#poslao"],
    alt: "Pregled nove slike s gumbima Odobri i Odbij." },
  { id: "V-11", uredaji: ["desktop", "mobitel"], putanja: () => "/admin/znakovi", izvor: "/admin/znakovi", sakrij: ADMIN,
    alt: "Slova, brojke i simboli u fontu za početno čitanje." },
  { id: "V-12", uredaji: ["desktop"], putanja: (p) => `/admin/zadaci/${p.zadaci.scena}/dijete`, izvor: "/admin/zadaci/<id>/dijete (scena Pečemo kolačiće)", sakrij: [],
    priprema: async (page) => { await page.click(".gumb-kreni"); await page.waitForTimeout(1200); },
    alt: "Ilustracija scene Pečemo kolačiće sa slikama ispod." },
  { id: "V-13", uredaji: ["desktop", "mobitel"], putanja: () => "/admin/predlosci", izvor: "/admin/predlosci, dijalog „Po glasovima…” (R, inicijalna)", sakrij: ADMIN,
    priprema: dijalogPoGlasovima, alt: "Odabir glasa, pozicije i isključenih glasova za novi radni listić." },
  { id: "V-14", uredaji: ["desktop", "mobitel"], putanja: (p) => `/admin/zadaci/${p.zadaci.listicOkvir}#ispis`, izvor: "/admin/zadaci/<id>#ispis (listić s okvirom)", sakrij: ADMIN,
    alt: "Radni listić na stranici A4 s ukrasnim okvirom i praznom crtom za ime." },
  { id: "V-15", uredaji: ["desktop", "mobitel"], teme: ["svijetla", "tamna"], putanja: () => "/admin/predlosci", izvor: "/admin/predlosci", sakrij: ADMIN,
    alt: "Jedanaest vrsta zadataka u predlošcima." },
  { id: "V-16", uredaji: ["desktop"], putanja: (p) => `/admin/zadaci/${p.zadaci.prviGlas}/dijete`, izvor: "/admin/zadaci/<id>/dijete (Prvi glas, kolo zavrteno)", sakrij: [],
    priprema: async (page) => {
      await page.click(".gumb-kreni");
      await page.click(".kolo-gumb");
      await page.waitForSelector(".kolo-iskoci", { timeout: 15000 });
      await page.waitForTimeout(700);
    },
    alt: "Kolo sa slovima i slike među kojima dijete traži one koje počinju zadanim glasom." },
  { id: "V-17", uredaji: ["desktop"], putanja: (p) => `/admin/zadaci/${p.zadaci.slogovi}#ispis`, izvor: "/admin/zadaci/<id>#ispis (Prebrajanje slogova)", sakrij: ADMIN,
    alt: "Zadatak prebrajanja: ispod svake slike kružići za slogove." },
  { id: "V-18", uredaji: ["desktop"], putanja: (p) => `/admin/zadaci/${p.zadaci.listicOkvir}#okvir`, izvor: "/admin/zadaci/<id>#okvir (listić s okvirom)", sakrij: ADMIN,
    alt: "Izbor okvira: rubovi, mašne i ukrasi za kutove." },
  { id: "V-20", uredaji: ["desktop"], putanja: (p) => `/b/${p.biljeznice.zimska.slug}`, izvor: "/b/<slug> (Zimska bilježnica, Božić), 3 ekrana riješena", sakrij: [],
    priprema: (page) => igra(page, 3), alt: "Igra u temi Božić: zadatak na tabletu i bor s lampicama." },
  { id: "V-21", uredaji: ["mobitel"], putanja: (p) => `/b/${p.biljeznice.proljetna.slug}`, izvor: "/b/<slug> (Proljetna bilježnica, Proljeće), 2 ekrana riješena", sakrij: [],
    priprema: (page) => igra(page, 2), alt: "Igra u temi Proljeće na mobitelu: stablo jabuke i zadatak sa slikama." },
  { id: "V-22", uredaji: ["desktop", "mobitel"], putanja: (p) => `/b/${p.biljeznice.zimska.slug}`, izvor: "/b/<slug> (Zimska bilježnica), sve riješeno", sakrij: [],
    priprema: doKraja, alt: "Završni ekran igre s porukom Bravo i gumbom Ponovi." },
  { id: "V-23", uredaji: ["desktop"], putanja: (p) => `/b/${p.biljeznice.zimska.slug}/ispis`, izvor: "/b/<slug>/ispis, naslovnica (cijeli A4 smanjen u 1280×800)", sakrij: [".alati"],
    priprema: naslovnica, alt: "Naslovnica bilježnice s borom čije lampice dijete boji." },
  { id: "V-24", uredaji: ["desktop"], putanja: (p) => `/admin/biljeznice/${p.biljeznice.zimska.id}`, izvor: "/admin/biljeznice/<id> (Zimska bilježnica)", sakrij: [...ADMIN, "#slug", ".slug"],
    alt: "Bilježnica sa zadacima složenima po redu." },
];

// ---------- Zajedničko ----------

function kolacic(): string {
  const v = process.env.LOGOMEDO_KOLACIC?.trim() || (existsSync(join(CACHE, "kolacic")) ? readFileSync(join(CACHE, "kolacic"), "utf8").trim() : "");
  if (!v) throw new Error("Nema kolačića: LOGOMEDO_KOLACIC ili ~/.cache/logomedo-staging/kolacic (scripts/staging-sesija.sh).");
  return v.replace(new RegExp(`^${KOLACIC}=`), "");
}

/** Vrijednosti koje ne smiju biti vidljive na snimci (e-mail, njegov lokalni dio, slugovi). Nikad se ne ispisuju. */
function tajne(p: Probni | null): string[] {
  const t: string[] = [];
  const f = join(CACHE, "logoped-email");
  if (existsSync(f)) {
    const e = readFileSync(f, "utf8").trim().toLowerCase();
    if (e) t.push(e);
    const lokalni = e.split("@")[0];
    if (lokalni && lokalni.length >= 5) t.push(lokalni);
  }
  if (p) t.push(p.biljeznice.zimska.slug, p.biljeznice.proljetna.slug);
  return t;
}

/** `id → r2_kljuc` odobrenih slika iz staging D1 (wrangler, --env staging, samo SELECT). */
let kljucevi: Map<number, string> | null = null;
function odobreneSlike(): Map<number, string> {
  if (kljucevi) return kljucevi;
  const izlaz = execFileSync("npx", ["wrangler", "d1", "execute", "logomedo-staging", "--remote", "--config", "wrangler.jsonc", "--env", "staging", "--json",
    "--command", "SELECT id, r2_kljuc FROM slike WHERE status = 'odobrena'"],
    { cwd: join(import.meta.dirname, ".."), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: RACUN }, maxBuffer: 64 << 20 });
  const redovi = JSON.parse(izlaz)[0].results as { id: number; r2_kljuc: string }[];
  return (kljucevi = new Map(redovi.map((r) => [r.id, r.r2_kljuc])));
}

async function kontekst(b: Browser, u: Uredaj, tema: Tema): Promise<BrowserContext> {
  const ctx = await b.newContext({
    ...(u === "desktop"
      ? { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }
      : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }),
    colorScheme: tema === "tamna" ? "dark" : "light",
    reducedMotion: "reduce",
    locale: "hr-HR",
  });
  await ctx.addCookies([{ name: KOLACIC, value: kolacic(), url: HOST, secure: true, httpOnly: true, sameSite: "Lax" }]);
  await ctx.addInitScript((t) => { try { localStorage.setItem("logomedo-tema", t); } catch {} }, tema);
  // Samo staging: sve ostalo osim CDN-a slika i fontova se odbija.
  await ctx.route("**/*", (r) => {
    const h = new URL(r.request().url()).hostname;
    return h === "staging.logomedo.com" || h === "cdn.logomedo.com" || h.endsWith("gstatic.com") || h.endsWith("googleapis.com") ? r.continue() : r.abort();
  });
  // Odobrene slike riječi s CDN-a (privatni R2 staginga je prazan); registrirano poslije, pa ide prije gornjeg.
  const mapa = odobreneSlike();
  await ctx.route(/^https:\/\/staging\.logomedo\.com\/admin\/slika\/\d+(\?.*)?$/, async (r) => {
    const kljuc = mapa.get(Number(new URL(r.request().url()).pathname.split("/").pop()));
    if (!kljuc) return r.fallback();
    const o = await r.fetch({ url: `${CDN}/${kljuc}` });
    return r.fulfill({ response: o });
  });
  return ctx;
}

/** Slike u vidnom polju učitane, fontovi spremni. */
async function cekajSlike(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForFunction(() => {
    const vidljive = [...document.images].filter((i) => {
      const r = i.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(i).visibility !== "hidden";
    });
    return vidljive.every((i) => i.complete && i.naturalWidth > 0) && document.fonts.status === "loaded";
  }, null, { timeout: 20000, polling: 250 }).catch(() => console.warn("  (neke slike se nisu učitale u 20 s)"));
}

/**
 * Mobitel, admin: dva propusta u CSS-u admina koja snimka zaobilazi (prijedlog popravka u AdminOkvir.astro,
 * docs/landing/research/2026-11-19-snimke.md):
 * - globalni `.skupina` bočne trake (na mobitelu `flex-direction: row`) pogađa i `section.skupina` na katalogu i
 *   znakovima, pa naslov skupine i mreža stoje jedno uz drugo;
 * - `main.sadrzaj` je stavka mreže s `min-width: auto`: list A4 (794 px) ga raširi na ~880 px, pa „Stane” u Ispisu
 *   ostane 100 % i list izlazi iz ekrana. Nakon `min-width: 0` resize pusti editor da sam smanji list.
 */
const CSS_MOBITEL_ADMIN = `main .skupina{flex-direction:column!important}main.sadrzaj{min-width:0!important}`;

const CSS_MIRNO = `*,*::before,*::after{transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}`;

async function sakrij(page: Page, sel: string[]) {
  await page.addStyleTag({ content: CSS_MIRNO + (sel.length ? `${sel.join(",")}{visibility:hidden!important}` : "") });
}

/** Vidljivi tekst i vrijednosti polja: bez tajni i bez riječi iz ZABRANJENO. Vraća što je nađeno (bez vrijednosti) ili "". */
async function provjeri(page: Page, t: string[]): Promise<string> {
  const tekst = await page.evaluate(() => {
    const polja = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")]
      .filter((x) => x.type !== "hidden" && x.checkVisibility({ visibilityProperty: true } as any)).map((x) => x.value);
    return (document.body.innerText + "\n" + polja.join("\n")).toLowerCase();
  });
  if (t.some((x) => x && tekst.includes(x))) return "e-mail ili slug";
  const z = tekst.match(ZABRANJENO);
  return z ? `zabranjen pojam „${z[0]}”` : "";
}

function webp(png: string, ime: string): string {
  const cilj = join(IZLAZ, ime);
  execFileSync("cwebp", ["-quiet", "-q", "80", "-m", "6", "-metadata", "none", png, "-o", cilj]);
  return cilj;
}

function dimenzijeWebp(f: string): string {
  const b = readFileSync(f);
  // VP8X: širina/visina u bajtovima 24–29 (24-bitno, minus 1); VP8 i VP8L za cwebp bez alfe/metapodataka.
  const vrsta = b.toString("ascii", 12, 16);
  if (vrsta === "VP8X") return `${1 + b.readUIntLE(24, 3)}×${1 + b.readUIntLE(27, 3)}`;
  if (vrsta === "VP8 ") return `${b.readUInt16LE(26) & 0x3fff}×${b.readUInt16LE(28) & 0x3fff}`;
  if (vrsta === "VP8L") { const n = b.readUInt32LE(21); return `${(n & 0x3fff) + 1}×${((n >> 14) & 0x3fff) + 1}`; }
  return "?";
}

// ---------- Snimanje ----------

async function snimaj(ids: string[]) {
  if (!existsSync(PROBNI)) throw new Error("Nema ~/.cache/logomedo-staging/probni.json: prvo `node scripts/landing-snimke.ts --pripremi`.");
  const p = JSON.parse(readFileSync(PROBNI, "utf8")) as Probni;
  const t = tajne(p);
  const odabrane = ids.length ? SNIMKE.filter((s) => ids.includes(s.id)) : SNIMKE;
  if (!odabrane.length) throw new Error(`Nepoznat ID; postoje: ${SNIMKE.map((s) => s.id).join(" ")}`);
  mkdirSync(IZLAZ, { recursive: true });
  const tmp = mkdtempSync(join(process.env.LANDING_SNIMKE_TMP ?? tmpdir(), "snimke-"));
  const b = await chromium.launch({ channel: "chrome" });
  const nastale: string[] = [];
  let greske = 0;
  try {
    for (const s of odabrane) for (const u of s.uredaji) for (const tema of s.teme ?? ["svijetla"]) {
      const ime = `v${brojV(s.id)}-${u}${tema === "tamna" ? "-tamna" : ""}.webp`;
      if (s.kao && tema === "svijetla") {
        const izvor = join(IZLAZ, `v${brojV(s.kao)}-${u}.webp`);
        if (existsSync(izvor)) { copyFileSync(izvor, join(IZLAZ, ime)); nastale.push(ime); console.log(`${s.id} ${u} ${tema}: kopija ${s.kao}`); continue; }
      }
      process.stdout.write(`${s.id} ${u} ${tema}… `);
      const ctx = await kontekst(b, u, tema);
      const page = await ctx.newPage();
      try {
        const o = await page.goto(HOST + s.putanja(p), { waitUntil: "domcontentloaded" });
        if (!o || o.status() >= 400) throw new Error(`HTTP ${o?.status()}`);
        if (new URL(page.url()).pathname.startsWith("/admin/login")) throw new Error("sesija je istekla (staging-sesija.sh)");
        await cekajSlike(page);
        await sakrij(page, s.sakrij);
        if (s.putanja(p).startsWith("/admin")) { await page.addStyleTag({ content: CSS_ADMIN }); await bezModela(page); }
        if (u === "mobitel" && s.putanja(p).startsWith("/admin")) {
          await page.addStyleTag({ content: CSS_MOBITEL_ADMIN });
          await page.evaluate(() => dispatchEvent(new Event("resize")));
          await page.waitForTimeout(300);
        }
        if (s.priprema) { await s.priprema(page, p, u); await cekajSlike(page); }
        const nadeno = await provjeri(page, t);
        if (nadeno) throw new Error(`na stranici je vidljiv ${nadeno}: snimka se ne sprema`);
        const png = join(tmp, ime.replace(/\.webp$/, ".png"));
        await page.screenshot({ path: png, animations: "disabled" });
        webp(png, ime);
        nastale.push(ime);
        console.log("ok");
      } catch (e) {
        greske++;
        console.log(`GREŠKA: ${(e as Error).message.split("\n")[0]}`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await b.close();
  }
  console.log("\nDatoteka                        Veličina     Bajtova");
  for (const ime of nastale) {
    const f = join(IZLAZ, ime);
    console.log(`${ime.padEnd(32)}${dimenzijeWebp(f).padEnd(13)}${statSync(f).size}`);
  }
  if (greske) { console.log(`\n${greske} snimki nije uspjelo.`); process.exitCode = 1; }
}

// ---------- --pripremi: probni podaci kroz iste forme kao admin UI ----------

async function forma(page: Page, putanja: string, polja: [string, string][]): Promise<string> {
  return page.evaluate(async ({ putanja, polja }) => {
    const f = new FormData();
    for (const [k, v] of polja) f.append(k, v);
    const o = await fetch(putanja, { method: "POST", body: f });
    if (!o.ok) throw new Error(`${putanja}: HTTP ${o.status}`);
    const u = new URL(o.url);
    return u.pathname + u.search;
  }, { putanja, polja });
}

/** Novi zadatak (POST /admin/api/zadatak, kao kartica predloška); vraća ID iz preusmjeravanja. */
async function noviZadatak(page: Page, polja: [string, string][]): Promise<number> {
  const kamo = await forma(page, "/admin/api/zadatak", polja);
  const m = kamo.match(/^\/admin\/zadaci\/(\d+)/);
  if (!m) throw new Error(`zadatak nije napravljen (${kamo.startsWith("/admin/predlosci") ? "nema riječi za odabir" : "neočekivano preusmjeravanje"})`);
  return Number(m[1]);
}

interface PodaciEditora {
  zadatak: { id: number; naslov: string; uputa: string; podrucje_id: number | null; stil: string; sadrzaj: any; okvir: any };
  rijeci: { id: number; rijec: string; slika: string | null }[];
  pozadine: { id: number; naziv: string }[];
}

async function editor(page: Page, id: number): Promise<PodaciEditora> {
  await page.goto(`${HOST}/admin/zadaci/${id}`, { waitUntil: "domcontentloaded" });
  return JSON.parse(await page.locator("#podaci").textContent() ?? "null");
}

/** Spremanje kao gumb Spremi u editoru (POST JSON /admin/api/zadatak/<id>). */
async function spremi(page: Page, id: number, izmjene: Partial<PodaciEditora["zadatak"]>) {
  const z = (await editor(page, id)).zadatak;
  const tijelo = { naslov: z.naslov, uputa: z.uputa, podrucje_id: z.podrucje_id, stil: z.stil, sadrzaj: z.sadrzaj, okvir: z.okvir, ...izmjene };
  await page.evaluate(async ({ id, tijelo }) => {
    const o = await fetch(`/admin/api/zadatak/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tijelo) });
    if (!o.ok) throw new Error(`spremanje zadatka: HTTP ${o.status}`);
  }, { id, tijelo });
}

/**
 * Rime u zadatku „Rima” (Zimska bilježnica): fiksne, ne nasumične iz predloška (landing odluka 800). V-4 snima treći
 * ekran (SLON – BALON), V-20 četvrti (CRKVA – MRKVA). Redak: zadana, ponuđene tri, indeks točne.
 */
const RIME: [string, [string, string, string], number][] = [
  ["kapa", ["šapa", "miš", "brokula"], 0],
  ["čaj", ["frula", "muha", "zmaj"], 2],
  ["slon", ["kuća", "balon", "žlica"], 1],
  ["crkva", ["kruška", "mačka", "mrkva"], 2],
];

async function postaviRime(page: Page, id: number) {
  const { rijeci } = await editor(page, id);
  const rid = (r: string) => {
    const x = rijeci.find((w) => w.rijec.toLocaleLowerCase("hr") === r && w.slika);
    if (!x) throw new Error(`Rima: nema riječi „${r}” sa slikom`);
    return x.id;
  };
  await spremi(page, id, { sadrzaj: { odnos: "rima", stavke: RIME.map(([z, p, t]) => ({ zadana: rid(z), ponudeno: p.map(rid), tocno: t })) } });
}

/**
 * Slika za /admin/pregled (V-10): malo izmijenjena kopija odobrene ilustracije cirkusa, upload kao kandidat (ne generira se).
 * Do odluke 801 bila je riba.
 */
const PREGLED = { rijec: "cirkus", kljuc: "ilustracija/cirkus/c2f5720c99964f3c.png" } as const;

async function slikaZaPregled(page: Page, rijeci: PodaciEditora["rijeci"]): Promise<number | null> {
  const r = rijeci.find((x) => x.rijec.toLocaleLowerCase("hr") === PREGLED.rijec);
  if (!r) { console.warn(`Slika za pregled: nema riječi „${PREGLED.rijec}”.`); return null; }
  const o = await fetch(`https://cdn.logomedo.com/${PREGLED.kljuc}`);
  if (!o.ok) { console.warn(`Slika za pregled: CDN ${o.status}.`); return null; }
  const png = join(mkdtempSync(join(tmpdir(), "snimke-upload-")), `${PREGLED.rijec}.png`);
  writeFileSync(png, Buffer.from(await o.arrayBuffer()));
  // Neznatno izmijenjena (zasićenje +2 %), da nije isti sha kao odobrena; ne zrcali se, jer bi natpis „TICKET” bio naopak.
  execFileSync("magick", [png, "-modulate", "100,102", png], { stdio: "ignore" });
  const b64 = readFileSync(png).toString("base64");
  await page.goto(`${HOST}/admin/pregled`, { waitUntil: "domcontentloaded" });
  const kamo = await page.evaluate(async ({ b64, rijec, ime }) => {
    const bajtovi = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const f = new FormData();
    f.append("slika", new File([bajtovi], ime, { type: "image/png" }));
    f.append("rijec", String(rijec)); f.append("stil", "ilustracija"); f.append("next", "/admin/pregled");
    f.append("prompt", "Probna slika za snimku landing stranice: kopija odobrene ilustracije.");
    const o = await fetch("/admin/api/upload", { method: "POST", body: f });
    return new URL(o.url).search;
  }, { b64, rijec: r.id, ime: `${PREGLED.rijec}.png` });
  const id = Number(new URLSearchParams(kamo).get("ucitano")) || null;
  if (!id) console.warn("Upload slike za pregled nije uspio.");
  return id;
}

const nasumicno = () => Math.random().toString(36).slice(2, 8);

async function pripremi() {
  if (existsSync(PROBNI) && !process.argv.includes("--ponovo"))
    throw new Error("probni.json već postoji (podaci su na stagingu). Za nove: --pripremi --ponovo (stari ostaju na stagingu).");
  const b = await chromium.launch({ channel: "chrome" });
  try {
    const ctx = await kontekst(b, "desktop", "svijetla");
    const page = await ctx.newPage();
    await page.goto(`${HOST}/admin/predlosci`, { waitUntil: "domcontentloaded" });
    if (new URL(page.url()).pathname.startsWith("/admin/login")) throw new Error("sesija je istekla (staging-sesija.sh)");
    const glasR = await page.locator("#glas-dijalog label.cip", { hasText: /^R$/ }).first().locator("input[name=glas]").getAttribute("value");
    if (!glasR) throw new Error("nema glasa R u dijalogu (logopedski mod isključen?)");

    const listic = (broj: string): [string, string][] => [["vrsta", "listic"], ["podrucje", ""], ["po_glasovima", "1"], ["glas", glasR], ["pozicija", "inicijalna"], ["broj", broj]];
    const z = {} as Probni["zadaci"];
    z.listic = await noviZadatak(page, listic("12"));
    await spremi(page, z.listic, { naslov: "Glas R na početku" });
    z.listicOkvir = await noviZadatak(page, listic("6"));
    await spremi(page, z.listicOkvir, { naslov: "Glas R na početku", okvir: { rub: "kocke-crvene", masna: null, kutovi: ["grancica", "medo", "konjic", "medenjak"] } });
    z.prviGlas = await noviZadatak(page, [["vrsta", "prvi_glas"], ["podrucje", ""], ["stavki", "3"]]);
    await spremi(page, z.prviGlas, { naslov: "Prvi glas" });
    z.slogovi = await noviZadatak(page, [["vrsta", "slogovi"], ["podrucje", ""], ["nacin", "analiza"], ["stavki", "8"]]);
    await spremi(page, z.slogovi, { naslov: "Prebrajanje slogova" });
    z.rima = await noviZadatak(page, [["vrsta", "odabir"], ["podrucje", ""], ["nacin", "rima"], ["stavki", "4"]]);
    await spremi(page, z.rima, { naslov: "Rima" });
    await postaviRime(page, z.rima);
    z.uljez = await noviZadatak(page, [["vrsta", "uljez"], ["podrucje", ""], ["nacin", "pocetni_glas"], ["stavki", "4"]]);
    await spremi(page, z.uljez, { naslov: "Izbaci uljeza" });
    z.istiGlas = await noviZadatak(page, [["vrsta", "odabir"], ["podrucje", ""], ["nacin", "pocetni_glas"], ["stavki", "4"]]);
    await spremi(page, z.istiGlas, { naslov: "Isti prvi glas" });

    // Scena „Pečemo kolačiće”: pet slika koje pripadaju, dvije koje ne.
    z.scena = await noviZadatak(page, [["vrsta", "scena"], ["podrucje", ""]]);
    const pe = await editor(page, z.scena);
    const pozadina = pe.pozadine.find((x) => /kolač/i.test(x.naziv));
    const rijec = (r: string) => pe.rijeci.find((x) => x.rijec.toLocaleLowerCase("hr") === r && x.slika)?.id;
    const da = ["jaje", "mlijeko", "brašno", "šećer", "zdjela", "žlica", "kolač", "pećnica", "maslac", "vilica"].map(rijec).filter(Boolean).slice(0, 5) as number[];
    const ne = ["lav", "auto", "riba", "lopta", "kit"].map(rijec).filter(Boolean).slice(0, 2) as number[];
    if (pozadina && da.length >= 3 && ne.length === 2) {
      await spremi(page, z.scena, { naslov: "Pečemo kolačiće", uputa: "Što nam treba za kolačiće?",
        sadrzaj: { pozadina_id: pozadina.id, gumbi: [...da.map((id) => ({ rijec_id: id, tocno: true })), ...ne.map((id) => ({ rijec_id: id, tocno: false }))] } });
    } else console.warn("Scena: nema pozadine „Pečemo kolačiće” ili riječi sa slikom; V-12 neće imati sadržaj.");

    // Bilježnice (nova, pa spremi sa zadacima i javna = 1, kao forma na /admin/biljeznice/<id>).
    const biljeznica = async (naslov: string, tema: string, zadaci: number[]) => {
      const slug = `${naslov.split(" ")[0].toLowerCase()}-${nasumicno()}`;
      const kamo = await forma(page, "/admin/biljeznice", [["akcija", "nova"], ["naslov", naslov], ["podnaslov", ""], ["slug", slug], ["tema", tema]]);
      const id = Number(kamo.match(/^\/admin\/biljeznice\/(\d+)/)?.[1]);
      if (!id) throw new Error(`bilježnica „${naslov}” nije napravljena`);
      await forma(page, `/admin/biljeznice/${id}`, [["akcija", "spremi"], ["naslov", naslov], ["podnaslov", ""], ["slug", slug], ["tema", tema], ["javna", "1"],
        ...zadaci.map((zid, i) => [`red_${zid}`, String(i + 1)] as [string, string])]);
      return { id, slug };
    };
    const biljeznice = {
      zimska: await biljeznica("Zimska bilježnica", "bozic", [z.rima, z.uljez, z.listic]),
      proljetna: await biljeznica("Proljetna bilježnica", "proljece", [z.istiGlas, z.prviGlas, z.slogovi]),
    };

    const slikaPregleda = await slikaZaPregled(page, pe.rijeci);

    mkdirSync(CACHE, { recursive: true });
    writeFileSync(PROBNI, JSON.stringify({ zadaci: z, biljeznice, slikaPregleda } satisfies Probni, null, 2), { mode: 0o600 });
    console.log(`Probni podaci napravljeni (${Object.keys(z).length} zadataka, 2 bilježnice, slika za pregled: ${slikaPregleda ? "da" : "ne"}); zapisano u ~/.cache/logomedo-staging/probni.json.`);
  } finally {
    await b.close();
  }
}

/** --rime: samo upiše RIME u postojeći probni zadatak (bez novog --pripremi). */
async function samoRime() {
  const p: Probni = JSON.parse(readFileSync(PROBNI, "utf8"));
  const b = await chromium.launch({ channel: "chrome" });
  try {
    const ctx = await kontekst(b, "desktop", "svijetla");
    await postaviRime(await ctx.newPage(), p.zadaci.rima);
    await ctx.unrouteAll({ behavior: "ignoreErrors" });
    console.log("Rime upisane u zadatak „Rima”.");
  } finally {
    await b.close();
  }
}

/**
 * --pregled: nova slika za V-10 (PREGLED). Stari kandidat u staging D1 postaje „odbijena” (wrangler, samo staging), da
 * pregled ima točno jednu sliku; novi ID ide u probni.json.
 */
async function samoPregled() {
  const p: Probni = JSON.parse(readFileSync(PROBNI, "utf8"));
  if (p.slikaPregleda) execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--remote", "--config", "wrangler.jsonc", "--env", "staging",
    "--command", `UPDATE slike SET status = 'odbijena' WHERE id = ${Number(p.slikaPregleda)} AND status = 'kandidat'`],
    { stdio: "ignore", cwd: join(import.meta.dirname, ".."), env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: "7dc7167b7e2e00923bfa7cd697df14e4" } });
  const b = await chromium.launch({ channel: "chrome" });
  try {
    const ctx = await kontekst(b, "desktop", "svijetla");
    const page = await ctx.newPage();
    p.slikaPregleda = await slikaZaPregled(page, (await editor(page, p.zadaci.scena)).rijeci);
    await ctx.unrouteAll({ behavior: "ignoreErrors" });
    writeFileSync(PROBNI, JSON.stringify(p, null, 2), { mode: 0o600 });
    console.log(`Slika za pregled: ${p.slikaPregleda ? "nova" : "nije uspjela"}.`);
  } finally {
    await b.close();
  }
}

if (process.argv.includes("--pripremi")) await pripremi();
else if (process.argv.includes("--pregled")) await samoPregled();
else if (process.argv.includes("--rime")) await samoRime();
else await snimaj(process.argv.slice(2).filter((a) => /^V-\d+$/.test(a)));
