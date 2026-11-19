// Odgovor iz /admin/poruke (S3, src/lib/email.ts `posaljiOdgovor`): bez ključa ništa, slanje s reply_to razgovora,
// In-Reply-To/References po odluci 206, predmet „Re:”, kratki citat, upis odlazne s Message-ID-jem. Bez mreže.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { env } from "./test/cloudflare-workers.ts";
import { napraviD1 } from "./test/d1.ts";
import { POSILJATELJ_ODGOVORA, kratkiCitat, posaljiOdgovor, predmetOdgovora, sadrzajOdgovora } from "./email.ts";
import { adresaZaOdgovor, noviRazgovor, spremiDolaznu, spremiOdlaznu } from "./poruke.ts";

beforeEach(() => { delete env.RESEND_API_KEY; env.DB = napraviD1(); });
const db = () => env.DB as D1Database;
const broj = async (t: string) => (await db().prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())!.n;

const MID_POZIVNICE = "<poz-1@eu-west-1.amazonses.com>";
const MID_DOLAZNE = "<CAgmail-2@mail.primjer.test>";

/** Razgovor kao u e2e S2: pozivnica (izlaz, s message_id) i odgovor logopeda (ulaz) s citatom. */
async function razgovorIzS2() {
  const r = await noviRazgovor({ email: "ana@primjer.test", ime: "Ana Horvat", predmet: "Vaš pristup LogoMedu je odobren", sada: "2026-11-19T10:00:00.000Z" });
  await spremiOdlaznu({ razgovorId: r.id, resendId: "poz", messageId: MID_POZIVNICE, od: "LogoMedo <pozivnica@logomedo.com>", za: ["ana@primjer.test"], predmet: "Vaš pristup LogoMedu je odobren", text: "pozivnica", html: null, poslao: null, createdAt: "2026-11-19T10:00:00.000Z" });
  await spremiDolaznu({
    resendId: "em_1", messageId: MID_DOLAZNE, inReplyTo: MID_POZIVNICE, reference: [MID_POZIVNICE],
    od: "Ana Horvat <ana@primjer.test>", za: [adresaZaOdgovor(r.kljuc)], predmet: "Re: Vaš pristup LogoMedu je odobren",
    text: "Hvala, <link> ne radi.\nŠto da napravim?\n\nOn Thu, 19 Nov 2026 at 11:00, LogoMedo <pozivnica@logomedo.com> wrote:\n> stara poruka s tokenom",
    html: null, tijeloFali: false, privitci: [], createdAt: "2026-11-19T11:00:00.000Z",
  });
  return r;
}

function lazniResend(o: { status?: number; id?: string; messageId?: string | null } = {}) {
  const pozivi: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    pozivi.push({ url, init });
    if (init?.method === "POST") {
      return new Response(JSON.stringify(o.status && o.status >= 400 ? { message: "invalid" } : { id: o.id ?? "odg_1" }), { status: o.status ?? 200 });
    }
    return new Response(JSON.stringify({ id: o.id ?? "odg_1", message_id: o.messageId === undefined ? "<odg-1@eu-west-1.amazonses.com>" : o.messageId }), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, pozivi, tijelo: () => JSON.parse(String(pozivi.find((p) => p.init?.method === "POST")!.init!.body)) };
}

test("bez RESEND_API_KEY ne šalje i ne upisuje ništa", async () => {
  const r = await razgovorIzS2();
  const l = lazniResend();
  const prije = await broj("poruke");
  assert.deepEqual(await posaljiOdgovor({ razgovorId: r.id, tekst: "Bok", poslao: "admin@primjer.test" }, l.f, 0), { ok: false, razlog: "nema_kljuca" });
  assert.equal(l.pozivi.length, 0);
  assert.equal(await broj("poruke"), prije);
});

test("šalje u istu nit: reply_to razgovora, In-Reply-To dolazne, References, Re:, citat; upis s Message-ID", async () => {
  env.RESEND_API_KEY = "re_test";
  const r = await razgovorIzS2();
  await db().prepare("UPDATE razgovori SET status = 'nerasporedjen' WHERE id = ?").bind(r.id).run();
  const l = lazniResend();
  const ishod = await posaljiOdgovor({ razgovorId: r.id, tekst: "Pozdrav Ana,\n\nšaljem novi <link>.\nLP", poslao: "admin@primjer.test" }, l.f, 0);
  assert.deepEqual(ishod, { ok: true, id: "odg_1" });

  const post = l.pozivi.find((p) => p.init?.method === "POST")!;
  assert.equal(post.url, "https://api.resend.com/emails");
  const b = l.tijelo();
  assert.equal(b.from, POSILJATELJ_ODGOVORA);
  assert.deepEqual(b.to, ["Ana Horvat <ana@primjer.test>"]);
  assert.equal(b.reply_to, adresaZaOdgovor(r.kljuc));
  assert.equal(b.subject, "Re: Vaš pristup LogoMedu je odobren");
  assert.equal(b.headers["In-Reply-To"], MID_DOLAZNE);
  assert.equal(b.headers.References, `${MID_POZIVNICE} ${MID_DOLAZNE}`);
  assert.ok(b.text.startsWith("LogoMedo\n\nPozdrav Ana,\n\nšaljem novi <link>.\nLP"), b.text);
  assert.ok(b.text.includes("> Hvala, <link> ne radi.\n> Što da napravim?"));
  assert.ok(!b.text.includes("stara poruka"), "citat bez citata starijih mailova");
  assert.ok(b.html.includes("šaljem novi &lt;link&gt;.<br>LP"));
  assert.ok(!b.html.includes("<link>"));
  assert.ok(!/\{\{/.test(b.html + b.text), "svi placeholderi popunjeni");
  assert.ok(l.pozivi.some((p) => p.url === "https://api.resend.com/emails/odg_1" && !p.init?.method), "dohvat Message-ID");

  const m = (await db().prepare("SELECT * FROM poruke WHERE resend_id = 'odg_1'").first<Record<string, unknown>>())!;
  assert.equal(m.smjer, "izlaz");
  assert.equal(m.poslao, "admin@primjer.test");
  assert.equal(m.message_id, "<odg-1@eu-west-1.amazonses.com>");
  assert.equal(m.in_reply_to, MID_DOLAZNE);
  assert.equal(m.reference, `${MID_POZIVNICE} ${MID_DOLAZNE}`);
  assert.equal(m.text, "Pozdrav Ana,\n\nšaljem novi <link>.\nLP");
  const rz = (await db().prepare("SELECT * FROM razgovori WHERE id = ?").bind(r.id).first<Record<string, unknown>>())!;
  assert.equal(rz.status, "otvoren", "odgovor razvrsta razgovor");
  assert.equal(rz.zadnja_at, m.created_at);

  // Logopedov odgovor na naš odgovor opet sjeda u isti razgovor (i bez ključa, po References).
  const d = await spremiDolaznu({
    resendId: "em_2", messageId: "<CAgmail-3@mail.primjer.test>", inReplyTo: "<odg-1@eu-west-1.amazonses.com>",
    reference: [MID_POZIVNICE, MID_DOLAZNE, "<odg-1@eu-west-1.amazonses.com>"], od: "drugi@primjer.test", za: ["netko@primjer.test"],
    predmet: "Re: Vaš pristup", text: "Radi!", html: null, tijeloFali: false, privitci: [], createdAt: "2026-11-19T12:00:00.000Z",
  });
  assert.deepEqual(d.nova && [d.razgovorId, d.nacin], [r.id, "reference"]);
});

test("bez dolazne: In-Reply-To je zadnja odlazna s Message-ID, bez citata", async () => {
  env.RESEND_API_KEY = "re_test";
  const r = await noviRazgovor({ email: "b@primjer.test", predmet: "Pozivnica" });
  await spremiOdlaznu({ razgovorId: r.id, resendId: "poz", messageId: MID_POZIVNICE, od: "x", za: ["b@primjer.test"], predmet: "Pozivnica", text: "t", html: null, poslao: null });
  const l = lazniResend();
  await posaljiOdgovor({ razgovorId: r.id, tekst: "Dodatak", poslao: "a@primjer.test" }, l.f, 0);
  const b = l.tijelo();
  assert.deepEqual(b.to, ["b@primjer.test"]);
  assert.equal(b.headers["In-Reply-To"], MID_POZIVNICE);
  assert.equal(b.headers.References, MID_POZIVNICE);
  assert.ok(!b.text.includes(">"));
});

test("bez ikakvog Message-ID nema zaglavlja niti; nedostupan Message-ID ostaje null", async () => {
  env.RESEND_API_KEY = "re_test";
  const r = await noviRazgovor({ email: "c@primjer.test" });
  const l = lazniResend({ messageId: null });
  const ishod = await posaljiOdgovor({ razgovorId: r.id, tekst: "Bok", poslao: "a@primjer.test" }, l.f, 0);
  assert.equal(ishod.ok, true);
  assert.equal(l.tijelo().headers, undefined);
  assert.equal(l.tijelo().subject, "Re: LogoMedo");
  assert.equal(l.pozivi.filter((p) => !p.init?.method).length, 2, "jedan ponovljeni dohvat");
  const m = (await db().prepare("SELECT message_id FROM poruke WHERE resend_id = 'odg_1'").first<{ message_id: string | null }>())!;
  assert.equal(m.message_id, null);
});

test("greška API-ja, prazan tekst i nepoznat razgovor: ništa se ne upisuje", async () => {
  env.RESEND_API_KEY = "re_test";
  const r = await razgovorIzS2();
  const prije = await broj("poruke");
  const l = lazniResend({ status: 422 });
  assert.deepEqual(await posaljiOdgovor({ razgovorId: r.id, tekst: "Bok", poslao: "a" }, l.f, 0), { ok: false, razlog: "greska", detalj: "422 invalid" });
  assert.deepEqual(await posaljiOdgovor({ razgovorId: r.id, tekst: "  \n ", poslao: "a" }, l.f, 0), { ok: false, razlog: "prazno" });
  assert.deepEqual(await posaljiOdgovor({ razgovorId: 999, tekst: "Bok", poslao: "a" }, l.f, 0), { ok: false, razlog: "nema_razgovora" });
  const bacaj = (async () => { throw new Error("mreža"); }) as typeof fetch;
  assert.equal((await posaljiOdgovor({ razgovorId: r.id, tekst: "Bok", poslao: "a" }, bacaj, 0)).ok, false);
  assert.equal(await broj("poruke"), prije);
});

test("predmet, kratki citat i sadržaj", () => {
  assert.equal(predmetOdgovora("Re: RE: Odg: Pitanje"), "Re: Pitanje");
  assert.equal(predmetOdgovora("Fwd: Pitanje"), "Re: Fwd: Pitanje");
  assert.equal(predmetOdgovora(null), "Re: LogoMedo");
  assert.equal(kratkiCitat(Array.from({ length: 20 }, (_, i) => `red ${i}`).join("\n")).split("\n").length, 12);
  assert.ok(kratkiCitat("x".repeat(2000)).endsWith("…"));
  const s = sadrzajOdgovora({ tekst: "Bok", predmet: "Pitanje", citat: null });
  assert.equal(s.subject, "Re: Pitanje");
  assert.ok(!/\{\{/.test(s.html + s.text));
  assert.ok(s.text.includes("Na ovu poruku možete odgovoriti"));
});

test("ključ obrasca ide u Idempotency-Key; ponovljeni POST s istim id-jem ne upisuje drugu poruku", async () => {
  env.RESEND_API_KEY = "re_test";
  const r = await razgovorIzS2();
  const l = lazniResend({ id: "odg_isti" });
  const kljuc = "0b6c1c2e-8f1a-4d1e-9a3b-5c6d7e8f9a0b";
  const prije = await broj("poruke");
  assert.deepEqual(await posaljiOdgovor({ razgovorId: r.id, tekst: "Bok", poslao: "a@primjer.test", kljucSlanja: kljuc }, l.f, 0), { ok: true, id: "odg_isti" });
  assert.deepEqual(await posaljiOdgovor({ razgovorId: r.id, tekst: "Bok", poslao: "a@primjer.test", kljucSlanja: kljuc }, l.f, 0), { ok: true, id: "odg_isti" });
  const postovi = l.pozivi.filter((p) => p.init?.method === "POST");
  assert.equal(postovi.length, 2);
  for (const p of postovi) assert.equal((p.init!.headers as Record<string, string>)["Idempotency-Key"], `odgovor-${r.id}-${kljuc}`);
  assert.equal(await broj("poruke"), prije + 1);
});

test("neispravan ključ se ne šalje kao Idempotency-Key", async () => {
  env.RESEND_API_KEY = "re_test";
  const r = await razgovorIzS2();
  const l = lazniResend();
  await posaljiOdgovor({ razgovorId: r.id, tekst: "Bok", poslao: "a", kljucSlanja: "kratko\r\nX: y" }, l.f, 0);
  const post = l.pozivi.find((p) => p.init?.method === "POST")!;
  assert.equal("Idempotency-Key" in (post.init!.headers as Record<string, string>), false);
});

test("409 concurrent_idempotent_requests: „u tijeku”, ništa se ne upisuje", async () => {
  env.RESEND_API_KEY = "re_test";
  const r = await razgovorIzS2();
  const f = (async () => new Response(JSON.stringify({ name: "concurrent_idempotent_requests", message: "x" }), { status: 409 })) as unknown as typeof fetch;
  const prije = await broj("poruke");
  assert.deepEqual(
    await posaljiOdgovor({ razgovorId: r.id, tekst: "Bok", poslao: "a", kljucSlanja: "0b6c1c2e-8f1a-4d1e-9a3b-5c6d7e8f9a0b" }, f, 0),
    { ok: false, razlog: "u_tijeku" },
  );
  assert.equal(await broj("poruke"), prije);
});
