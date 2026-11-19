// /admin/poruke (S3): popis (nepročitani prvi, isječak bez citata), nit s privitcima, HTML za iframe (cid: samo
// kad se pojavljuje u HTML-u), status, brzi odgovori (validacija, jedinstvena kratica, uredi, obriši).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import {
  bezCitata, brziOdgovori, htmlZaPrikaz, isjecak, nit, obrisiBrziOdgovor, oznaciProcitano, popisRazgovora, postaviStatus,
  privitak, spremiBrziOdgovor, spremiDolaznu, type Dolazna,
} from "./poruke.ts";

beforeEach(() => { env.DB = napraviD1(); });

let n = 0;
const dolazna = (d: Partial<Dolazna> = {}): Dolazna => ({
  resendId: `em_${++n}`, messageId: `<m${n}@primjer.test>`, inReplyTo: null, reference: [],
  od: "Ana Horvat <ana@primjer.test>", za: ["bok@primjer.test"], predmet: "Pitanje", text: "Pozdrav", html: null,
  tijeloFali: false, privitci: [], createdAt: "2026-11-19T10:00:00.000Z", ...d,
});

test("bezCitata i isječak režu citate (Gmail, Outlook, >)", () => {
  assert.equal(bezCitata("Hvala!\n\nOn Thu, 19 Nov 2026 at 11:00, X <x@primjer.test> wrote:\n> staro"), "Hvala!");
  assert.equal(bezCitata("Hvala!\n\nOn Thu, 19 Nov 2026 at 11:00, X\n<x@primjer.test> wrote:\n> staro"), "Hvala!");
  assert.equal(bezCitata("Može.\nčet, 19. stu 2026. u 11:00 X <x@primjer.test> je napisao/la:\n> staro"), "Može.");
  assert.equal(bezCitata("Ok\n-----Original Message-----\nFrom: x"), "Ok");
  assert.equal(bezCitata("Ok\n> citat"), "Ok");
  assert.equal(bezCitata(null), "");
  assert.equal(isjecak("a\n\n  b   c"), "a b c");
  assert.equal(isjecak("x".repeat(300)).length, 140);
});

test("popis: nepročitani prvi, zatim po zadnjoj poruci; isječak zadnje poruke", async () => {
  await spremiDolaznu(dolazna({ od: "a@primjer.test", createdAt: "2026-11-19T09:00:00.000Z", text: "Prva\n> citat" }));
  await spremiDolaznu(dolazna({ od: "b@primjer.test", createdAt: "2026-11-19T11:00:00.000Z" }));
  const c = await spremiDolaznu(dolazna({ od: "c@primjer.test", createdAt: "2026-11-19T12:00:00.000Z" }));
  assert.ok(c.nova);
  await oznaciProcitano(c.razgovorId);
  const p = await popisRazgovora();
  assert.deepEqual(p.map((r) => r.email), ["b@primjer.test", "a@primjer.test", "c@primjer.test"]);
  assert.equal(p[1].isjecak, "Prva");
  assert.equal(p[1].poruka, 1);
  assert.equal(p[1].zadnji_smjer, "ulaz");
  assert.equal(p[2].neprocitano, 0);
});

test("nit s privitcima i HTML za prikaz", async () => {
  const d = await spremiDolaznu(dolazna({
    html: '<p>Slika: <img src="cid:slika1"></p><img src=cid:nema>',
    privitci: [
      { r2Kljuc: "poruke/em/a1", ime: "slika.png", tip: "image/png", velicina: 10, contentId: "<slika1>" },
      { r2Kljuc: "poruke/em/a2", ime: "nalaz.pdf", tip: "application/pdf", velicina: 20, contentId: "ii_pdf" },
      { r2Kljuc: null, ime: "video.mov", tip: "video/quicktime", velicina: 9, napomena: "tip nije dopušten" },
    ],
  }));
  assert.ok(d.nova);
  const t = (await nit(d.razgovorId))!;
  assert.equal(t.razgovor.status, "nerasporedjen");
  assert.equal(t.poruke.length, 1);
  const [slika, pdf, video] = t.poruke[0].privitci;
  assert.deepEqual([slika.ime, pdf.ime, video.r2_kljuc], ["slika.png", "nalaz.pdf", null]);
  assert.equal((await privitak(pdf.id))!.r2_kljuc, "poruke/em/a2");
  assert.equal(await nit(999), null);

  const h = htmlZaPrikaz(t.poruke[0].html!, t.poruke[0].privitci);
  assert.deepEqual(h.ugradeni, [slika.id], "samo cid koji je u HTML-u; PDF s content_id je običan privitak");
  assert.ok(h.html.startsWith('<base target="_blank">'));
  assert.ok(h.html.includes(`src="/admin/poruke/privitak/${slika.id}?prikaz=1"`));
  assert.ok(h.html.includes("src=cid:nema"), "nepoznat cid ostaje");
  assert.deepEqual(htmlZaPrikaz('<img src="cid:video">', [{ id: 5, r2_kljuc: null, content_id: "video" }]).ugradeni, [], "nespremljen privitak se ne ugrađuje");

  assert.equal(await postaviStatus(d.razgovorId, "zatvoren"), true);
  assert.equal((await nit(d.razgovorId))!.razgovor.status, "zatvoren");
  assert.equal(await postaviStatus(999, "otvoren"), false);
});

test("brzi odgovori: dodaj, validacija, jedinstvena kratica, uredi, obriši", async () => {
  const a = await spremiBrziOdgovor({ kratica: "/Link", naslov: "Novi link", tekst: "Šaljem novi link.\r\nLP" });
  assert.ok(a.ok);
  const [b] = await brziOdgovori();
  assert.deepEqual([b.kratica, b.tekst], ["link", "Šaljem novi link.\nLP"]);
  assert.deepEqual(await spremiBrziOdgovor({ kratica: "link", naslov: "x", tekst: "y" }), { ok: false, greska: "Kratica /link već postoji." });
  assert.equal((await spremiBrziOdgovor({ kratica: "ima razmak", naslov: "x", tekst: "y" })).ok, false);
  assert.equal((await spremiBrziOdgovor({ kratica: "ok", naslov: " ", tekst: "y" })).ok, false);
  assert.equal((await spremiBrziOdgovor({ kratica: "ok", naslov: "x", tekst: "" })).ok, false);
  assert.ok((await spremiBrziOdgovor({ kratica: "hvala", naslov: "Hvala", tekst: "Hvala!" })).ok);
  assert.deepEqual(await spremiBrziOdgovor({ id: b.id, kratica: "hvala", naslov: "x", tekst: "y" }), { ok: false, greska: "Kratica /hvala već postoji." });
  assert.ok((await spremiBrziOdgovor({ id: b.id, kratica: "poveznica", naslov: "Novi link", tekst: "Novo" })).ok);
  assert.deepEqual((await brziOdgovori()).map((x) => x.kratica), ["hvala", "poveznica"]);
  assert.deepEqual(await spremiBrziOdgovor({ id: 999, kratica: "z", naslov: "x", tekst: "y" }), { ok: false, greska: "Brzi odgovor više ne postoji." });
  assert.equal(await obrisiBrziOdgovor(b.id), true);
  assert.equal(await obrisiBrziOdgovor(b.id), false);
  assert.equal((await brziOdgovori()).length, 1);
});
