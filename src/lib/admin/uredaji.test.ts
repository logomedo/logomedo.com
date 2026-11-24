// Uređaji (docs/uredaji.md): limit istovremenih uređaja i „Nastavi ovdje”.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "../test/d1.ts";
import { env } from "../test/cloudflare-workers.ts";
import type { Session } from "./sesija.ts";
import {
  UREDAJ_COOKIE, odluci, opisUA, limitZa, provjeriUredaj, preuzmi, odjaviUredaj, mojiUredaji, sazeciUredaja,
  procitajLimitUredaja, type Uredaj,
} from "./uredaji.ts";

const LOGOPED = "ana@vrtic.hr";
const sesija = (email = LOGOPED, uloga: Session["uloga"] = "logoped"): Session =>
  ({ email, method: "passkey", expiresAt: "", createdAt: "", uloga, korisnikId: 1 });

beforeEach(() => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = "sa@primjer.hr";
  env.UREDAJI_PROVEDBA = "logoped";
});
const db = () => env.DB as D1Database;

const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const SAFARI_IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** Preglednik: kolačić uređaja pamti kao pravi preglednik. */
function preglednik(ua = CHROME_WIN, ip = "93.140.1.10", grad = "Zagreb") {
  let kljuc: string | null = null;
  const zahtjev = (tijelo?: FormData) => {
    const r = new Request("https://logomedo.com/admin", {
      method: tijelo ? "POST" : "GET",
      body: tijelo,
      headers: { "user-agent": ua, "cf-connecting-ip": ip, ...(kljuc ? { cookie: `${UREDAJ_COOKIE}=${kljuc}` } : {}) },
    });
    Object.defineProperty(r, "cf", { value: { city: grad, country: "HR", asOrganization: "Hrvatski Telekom" } });
    return r;
  };
  return {
    async otvori(s = sesija()) {
      const p = await provjeriUredaj(zahtjev(), s);
      if (p.setCookie) kljuc = /=([^;]+)/.exec(p.setCookie)![1];
      return p;
    },
    async nastaviOvdje(id: number | null = null, s = sesija()) {
      return preuzmi(zahtjev(), s, id);
    },
    zahtjev,
  };
}

const stari = (min: number) => db().prepare("UPDATE uredaji SET zadnji_put = ?").bind(new Date(Date.now() - min * 60_000).toISOString()).run();

test("opisUA", () => {
  assert.equal(opisUA(CHROME_WIN), "Chrome · Windows");
  assert.equal(opisUA(SAFARI_IPAD), "Safari · iPad");
  assert.equal(opisUA(null), "Nepoznat preglednik");
});

test("limitZa: bilježenje, logoped, superadmin", () => {
  assert.equal(limitZa("logoped", null, "biljezi"), null);
  assert.equal(limitZa("logoped", null, "logoped"), 2);
  assert.equal(limitZa("logoped", 4, "logoped"), 4);
  assert.equal(limitZa("superadmin", null, "logoped"), null);
  assert.equal(limitZa("superadmin", null, "svi"), 2);
});

test("odluci: aktivan uređaj zadržava mjesto i preko limita", () => {
  const sada = Date.now();
  const u = (id: number, hash: string, minPrije: number): Uredaj => ({
    id, kljuc_hash: hash, naziv: "", created_at: "", zadnji_put: new Date(sada - minPrije * 60_000).toISOString(),
    grad: null, drzava: null, mreza: null, mreza_hash: null, odjavljen_at: null, odjavio_id: null,
  });
  const svi = [u(1, "a", 1), u(2, "b", 2), u(3, "c", 3)];
  assert.deepEqual(odluci(svi, "a", 2, sada), { dopusti: true });
  const r = odluci(svi, "d", 2, sada);
  assert.equal(r.dopusti, false);
  assert.equal(svi.length, 3);
  // Neaktivni (stariji od 15 min) se ne broje.
  assert.equal(odluci([u(1, "a", 20), u(2, "b", 30)], "c", 1, sada).dopusti, true);
});

test("jedna osoba: tabovi, laptop + mobitel prolaze, treći uređaj bira", async () => {
  const laptop = preglednik();
  assert.equal((await laptop.otvori()).ok, true);
  assert.equal((await laptop.otvori()).ok, true); // drugi tab, isti kolačić
  const ipad = preglednik(SAFARI_IPAD);
  assert.equal((await ipad.otvori()).ok, true);
  const treci = preglednik(CHROME_WIN, "31.45.1.1", "Split");
  const p = await treci.otvori();
  assert.equal(p.ok, false);
  if (p.ok) return;
  assert.equal(p.aktivni.length, 2);
  assert.ok(p.setCookie, "kolačić se postavlja i kad uređaj ne smije, za „Nastavi ovdje”");
});

test("Nastavi ovdje: odjavi izabrani, on vidi tko ga je preuzeo, a vrati se kad se mjesto oslobodi", async () => {
  const laptop = preglednik();
  const ipad = preglednik(SAFARI_IPAD);
  const treci = preglednik(CHROME_WIN, "31.45.1.1", "Split");
  await laptop.otvori();
  await ipad.otvori();
  const p = await treci.otvori();
  assert.equal(p.ok, false);
  if (p.ok) return;
  const laptopId = p.aktivni.find((u) => u.naziv === "Chrome · Windows")!.id;
  assert.equal(await treci.nastaviOvdje(laptopId), true);
  assert.equal((await treci.otvori()).ok, true);

  const opet = await laptop.otvori();
  assert.equal(opet.ok, false);
  if (opet.ok) return;
  assert.equal(opet.preuzeo?.grad, "Split");

  // Nakon 15 min bez rada iPad i treći više nisu aktivni: laptop ulazi sam, bez stranice.
  await stari(16);
  assert.equal((await laptop.otvori()).ok, true);
  const [r] = (await db().prepare("SELECT COUNT(*) AS n FROM uredaji_dogadaji WHERE vrsta = 'preuzimanje'").all<{ n: number }>()).results;
  assert.equal(r.n, 1);
});

test("dijeljeni račun: pet logopeda naizmjence izbacuje jedan drugoga; sažetak to pokazuje", async () => {
  const ekipa = Array.from({ length: 5 }, (_, i) => preglednik(CHROME_WIN, `93.140.1.${i + 10}`, "Zagreb"));
  await ekipa[0].otvori();
  await ekipa[1].otvori();
  for (const p of ekipa.slice(2)) {
    assert.equal((await p.otvori()).ok, false);
    assert.equal(await p.nastaviOvdje(), true);
  }
  const s = (await sazeciUredaja()).get(LOGOPED)!;
  assert.equal(s.aktivnih, 2);
  assert.equal(s.uredaja30, 5);
  assert.equal(s.preuzimanja7, 3);
  assert.equal(s.previse7, 0, "„previše” se bilježi samo za uređaj koji već postoji");
});

test("superadmin bez limita dok provedba nije „svi”; bilježi se uvijek", async () => {
  const sa = sesija("sa@primjer.hr", "superadmin");
  for (let i = 0; i < 4; i++) assert.equal((await preglednik(CHROME_WIN, `10.0.${i}.1`).otvori(sa)).ok, true);
  env.UREDAJI_PROVEDBA = "svi";
  assert.equal((await preglednik().otvori(sa)).ok, false);
  env.UREDAJI_PROVEDBA = "";
  assert.equal((await preglednik().otvori()).ok, true);
  assert.equal((await sazeciUredaja()).get("sa@primjer.hr")!.uredaja30, 4);
});

test("limit iz retka korisnika", async () => {
  await db().prepare("INSERT INTO korisnici (email, uloga, aktivan, limit_uredaja) VALUES (?, 'logoped', 1, 1)").bind(LOGOPED).run();
  await preglednik().otvori();
  assert.equal((await preglednik(SAFARI_IPAD).otvori()).ok, false);
});

test("odjava iz Postavki: samo svoj uređaj", async () => {
  const laptop = preglednik();
  const ipad = preglednik(SAFARI_IPAD);
  await laptop.otvori();
  await ipad.otvori();
  const moji = await mojiUredaji(LOGOPED, laptop.zahtjev());
  assert.equal(moji.filter((u) => u.ovaj).length, 1);
  const ipadId = moji.find((u) => !u.ovaj)!.id;
  assert.equal(await odjaviUredaj("drugi@vrtic.hr", ipadId, null, laptop.zahtjev()), false);
  assert.equal(await odjaviUredaj(LOGOPED, ipadId, null, laptop.zahtjev()), true);
  assert.equal((await mojiUredaji(LOGOPED, laptop.zahtjev())).find((u) => u.id === ipadId)!.aktivan, false);
});

test("mreža se sprema bez pune IP adrese", async () => {
  await preglednik(CHROME_WIN, "93.140.77.12").otvori();
  const red = await db().prepare("SELECT * FROM uredaji").first<Record<string, unknown>>();
  assert.ok(!JSON.stringify(red).includes("93.140"));
  assert.equal(String(red!.mreza_hash).length, 16);
});

test("procitajLimitUredaja", () => {
  assert.equal(procitajLimitUredaja(""), null);
  assert.equal(procitajLimitUredaja("3"), 3);
  assert.equal(procitajLimitUredaja("0"), undefined);
  assert.equal(procitajLimitUredaja("abc"), undefined);
});
