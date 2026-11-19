// Inbox (migracija 0039, src/lib/poruke.ts): ključ i adresa, traženje niti redom iz odluke 4, idempotentna
// dolazna poruka, privitci, odlazna, nepročitano.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import {
  adresaZaOdgovor, brojNeprocitanih, kljucIzAdrese, kljucRazgovora, messageIdovi, nadjiRazgovor, noviRazgovor,
  oznaciProcitano, razdvojiAdresu, spremiDolaznu, spremiOdlaznu, type Dolazna,
} from "./poruke.ts";

beforeEach(() => { env.DB = napraviD1(); });
const db = () => env.DB as D1Database;
const razgovor = (id: number) => db().prepare("SELECT * FROM razgovori WHERE id = ?").bind(id).first<Record<string, unknown>>();

let n = 0;
const dolazna = (d: Partial<Dolazna> = {}): Dolazna => ({
  resendId: `em_${++n}`, messageId: `<m${n}@primjer.test>`, inReplyTo: null, reference: [],
  od: "Ana Horvat <ana@primjer.test>", za: ["bok@primjer.test"], predmet: "Pitanje", text: "Pozdrav", html: null,
  tijeloFali: false, privitci: [], createdAt: `2026-11-19T10:00:${String(n % 60).padStart(2, "0")}.000Z`, ...d,
});

test("ključ: 26 znakova base32, nasumičan; adresa i natrag", () => {
  const k = kljucRazgovora();
  assert.match(k, /^[a-z2-7]{26}$/);
  assert.notEqual(k, kljucRazgovora());
  assert.equal(adresaZaOdgovor(k), `odgovor+${k}@poruke.logomedo.com`);
  assert.equal(kljucIzAdrese(adresaZaOdgovor(k)), k);
  assert.equal(kljucIzAdrese(`LogoMedo <ODGOVOR+${k.toUpperCase()}@Poruke.LogoMedo.com>`), k);
  assert.equal(kljucIzAdrese(`odgovor+${k}@primjer.test`), null);
  assert.equal(kljucIzAdrese(`netko+${k}@poruke.logomedo.com`), null);
  assert.equal(kljucIzAdrese("odgovor+kratak@poruke.logomedo.com"), null);
});

test("razdvojiAdresu i messageIdovi", () => {
  assert.deepEqual(razdvojiAdresu(' "Ana Horvat" <Ana@Primjer.TEST> '), { email: "ana@primjer.test", ime: "Ana Horvat" });
  assert.deepEqual(razdvojiAdresu("ana@primjer.test"), { email: "ana@primjer.test", ime: null });
  assert.deepEqual(messageIdovi("<a@x> <b@x>", null, "<b@x>\r\n <c@x>"), ["<a@x>", "<b@x>", "<c@x>"]);
});

test("noviRazgovor veže korisnika po e-mailu", async () => {
  await db().prepare("INSERT INTO korisnici (email, ime) VALUES ('ana@primjer.test', 'Ana')").run();
  const r = await noviRazgovor({ email: " ANA@primjer.test ", ime: "Ana", predmet: "Pozivnica", sada: "2026-11-19T09:00:00.000Z" });
  const red = await razgovor(r.id);
  assert.equal(red!.kljuc, r.kljuc);
  assert.equal(red!.email, "ana@primjer.test");
  assert.equal(red!.korisnik_id, 1);
  assert.equal(red!.status, "otvoren");
});

test("nit: adresa s ključem ima prednost, pa reference, pa pošiljatelj", async () => {
  const a = await noviRazgovor({ email: "ana@primjer.test", sada: "2026-11-19T09:00:00.000Z" });
  const b = await noviRazgovor({ email: "ana@primjer.test", sada: "2026-11-19T09:00:00.000Z" });
  await spremiOdlaznu({ razgovorId: b.id, resendId: "out1", messageId: "<izlaz@primjer.test>", od: "x@primjer.test", za: ["ana@primjer.test"], predmet: "P", text: "t", html: null, poslao: null, createdAt: "2026-11-19T11:00:00.000Z" });
  assert.deepEqual(await nadjiRazgovor({ za: ["bok@primjer.test", adresaZaOdgovor(a.kljuc)], reference: ["<izlaz@primjer.test>"], od: "ana@primjer.test" }), { id: a.id, nacin: "adresa" });
  // Nepoznat ključ u adresi: dalje po referencama.
  assert.deepEqual(await nadjiRazgovor({ za: [adresaZaOdgovor(kljucRazgovora())], reference: ["<x@y>", "<izlaz@primjer.test>"], od: "ana@primjer.test" }), { id: b.id, nacin: "reference" });
  // Bez ključa i referenci: zadnji razgovor s tim pošiljateljem (b ima noviju poruku).
  assert.deepEqual(await nadjiRazgovor({ za: [], reference: [], od: "Ana <ANA@primjer.test>" }), { id: b.id, nacin: "posiljatelj" });
  assert.equal(await nadjiRazgovor({ za: [], reference: [], od: "netko@primjer.test" }), null);
});

test("dolazna u postojeći razgovor: brojač, zadnja_at, zatvoren se otvara", async () => {
  const r = await noviRazgovor({ email: "ana@primjer.test", sada: "2026-11-19T09:00:00.000Z" });
  await db().prepare("UPDATE razgovori SET status = 'zatvoren' WHERE id = ?").bind(r.id).run();
  const i = await spremiDolaznu(dolazna({ za: [adresaZaOdgovor(r.kljuc)], createdAt: "2026-11-19T12:00:00.000Z" }));
  assert.deepEqual(i.nova && { razgovorId: i.razgovorId, nacin: i.nacin }, { razgovorId: r.id, nacin: "adresa" });
  await spremiDolaznu(dolazna({ za: [adresaZaOdgovor(r.kljuc)], createdAt: "2026-11-19T11:00:00.000Z" }));
  const red = await razgovor(r.id);
  assert.equal(red!.neprocitano, 2);
  assert.equal(red!.zadnja_at, "2026-11-19T12:00:00.000Z", "starija poruka ne vraća zadnja_at unatrag");
  assert.equal(red!.status, "otvoren");
  assert.equal(await brojNeprocitanih(), 2);
  await oznaciProcitano(r.id, "2026-11-19T13:00:00.000Z");
  assert.equal((await razgovor(r.id))!.neprocitano, 0);
  assert.equal(await brojNeprocitanih(), 0);
  const neprocitane = await db().prepare("SELECT COUNT(*) AS c FROM poruke WHERE procitano_at IS NULL").first<{ c: number }>();
  assert.equal(neprocitane!.c, 0);
});

test("nepoznat pošiljatelj: novi razgovor 'nerasporedjen' s imenom i predmetom", async () => {
  const i = await spremiDolaznu(dolazna({ od: "Iva Ivić <iva@primjer.test>", predmet: "Bok" }));
  assert.ok(i.nova);
  assert.equal(i.nacin, "novi");
  const red = await razgovor(i.razgovorId);
  assert.equal(red!.status, "nerasporedjen");
  assert.equal(red!.email, "iva@primjer.test");
  assert.equal(red!.ime, "Iva Ivić");
  assert.equal(red!.predmet, "Bok");
  assert.equal(red!.neprocitano, 1);
  assert.match(String(red!.kljuc), /^[a-z2-7]{26}$/);
});

test("idempotentno po resend_id: drugi put ništa, ni privitci", async () => {
  const d = dolazna({ privitci: [{ r2Kljuc: "poruke/em/a1", ime: "slika.jpg", tip: "image/jpeg", velicina: 3 }, { r2Kljuc: null, ime: "x.exe", tip: "application/x-msdownload", velicina: 9, napomena: "tip nije dopušten" }] });
  const prvi = await spremiDolaznu(d);
  assert.ok(prvi.nova);
  assert.deepEqual(await spremiDolaznu(d), { nova: false });
  const broj = async (t: string) => (await db().prepare(`SELECT COUNT(*) AS c FROM ${t}`).first<{ c: number }>())!.c;
  assert.equal(await broj("poruke"), 1);
  assert.equal(await broj("razgovori"), 1);
  assert.equal(await broj("privitci"), 2);
  const p = (await db().prepare("SELECT * FROM privitci ORDER BY id").all<Record<string, unknown>>()).results;
  assert.equal(p[0].poruka_id, prvi.porukaId);
  assert.equal(p[1].r2_kljuc, null);
  assert.equal(p[1].napomena, "tip nije dopušten");
});

test("utrka: dva istodobna upisa istog resend_id daju jednu poruku i jedan razgovor", async () => {
  const d = dolazna({ od: "nova@primjer.test" });
  const ishodi = await Promise.all([spremiDolaznu(d), spremiDolaznu(d)]);
  assert.deepEqual(ishodi.map((x) => x.nova).sort(), [false, true]);
  const broj = async (t: string) => (await db().prepare(`SELECT COUNT(*) AS c FROM ${t}`).first<{ c: number }>())!.c;
  assert.equal(await broj("poruke"), 1);
  assert.equal(await broj("razgovori"), 1, "batch duplikata se vrati s razgovorom");
});

test("odlazna: upis, zadnja_at, ne broji se kao nepročitana", async () => {
  const r = await noviRazgovor({ email: "ana@primjer.test", sada: "2026-11-19T09:00:00.000Z" });
  const id = await spremiOdlaznu({ razgovorId: r.id, resendId: "out9", od: "LogoMedo <x@primjer.test>", za: ["ana@primjer.test"], predmet: "Pozivnica", text: "t", html: "<p>t</p>", poslao: null, createdAt: "2026-11-19T10:00:00.000Z" });
  const p = await db().prepare("SELECT * FROM poruke WHERE id = ?").bind(id).first<Record<string, unknown>>();
  assert.equal(p!.smjer, "izlaz");
  assert.equal(p!.procitano_at, "2026-11-19T10:00:00.000Z");
  assert.equal((await razgovor(r.id))!.zadnja_at, "2026-11-19T10:00:00.000Z");
  assert.equal(await brojNeprocitanih(), 0);
});

test("CHECK: smjer i status", async () => {
  await assert.rejects(db().prepare("INSERT INTO razgovori (kljuc, email, zadnja_at, created_at, status) VALUES ('k', 'e', 't', 't', 'x')").run());
  await db().prepare("INSERT INTO razgovori (kljuc, email, zadnja_at, created_at) VALUES ('k', 'e', 't', 't')").run();
  await assert.rejects(db().prepare("INSERT INTO poruke (razgovor_id, smjer, od, za, created_at) VALUES (1, 'x', 'a', 'b', 't')").run());
});
