// Pozivnica e-poštom (Resend): bez ključa ne šalje, uspjeh i greška API-ja, escapanje imena, razgovor u inboxu
// (reply_to s ključem, kopija bez tokena, prazan razgovor se briše). Bez mreže.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { env } from "./test/cloudflare-workers.ts";
import { napraviD1 } from "./test/d1.ts";
import { POSILJATELJ, SKRIVENA_POVEZNICA, posaljiPozivnicu, sadrzajPozivnice } from "./email.ts";
import { kljucIzAdrese } from "./poruke.ts";

const P = { email: "logoped@primjer.test", ime: "<b>Ana</b> Horvat", url: "https://logomedo.com/admin/poziv#tok", istjece: "2026-11-22T12:00:00.000Z" };

beforeEach(() => { delete env.RESEND_API_KEY; env.DB = napraviD1(); });
const db = () => env.DB as D1Database;
const broj = async (t: string) => (await db().prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())!.n;

test("bez RESEND_API_KEY ne zove mrežu", async () => {
  let pozvan = false;
  const r = await posaljiPozivnicu(P, (async () => { pozvan = true; return new Response("{}"); }) as typeof fetch);
  assert.deepEqual(r, { ok: false, razlog: "nema_kljuca" });
  assert.equal(pozvan, false);
});

test("šalje na Resend s ispravnim poljima", async () => {
  env.RESEND_API_KEY = "re_test";
  let zahtjev: { url: string; init: RequestInit } | null = null;
  const r = await posaljiPozivnicu(P, (async (url: string, init: RequestInit) => {
    zahtjev = { url, init };
    return new Response(JSON.stringify({ id: "abc" }), { status: 200 });
  }) as unknown as typeof fetch);
  assert.deepEqual(r, { ok: true, id: "abc" });
  assert.equal(zahtjev!.url, "https://api.resend.com/emails");
  assert.equal((zahtjev!.init.headers as Record<string, string>).Authorization, "Bearer re_test");
  const b = JSON.parse(String(zahtjev!.init.body));
  assert.equal(b.from, POSILJATELJ);
  assert.deepEqual(b.to, ["logoped@primjer.test"]);
  assert.ok(b.text.includes(P.url));

  const k = kljucIzAdrese(b.reply_to);
  assert.ok(k, "reply_to je adresa razgovora");
  const rz = await db().prepare("SELECT * FROM razgovori WHERE kljuc = ?").bind(k).first<Record<string, unknown>>();
  assert.equal(rz!.email, "logoped@primjer.test");
  assert.equal(rz!.predmet, b.subject);
  const po = await db().prepare("SELECT * FROM poruke WHERE razgovor_id = ?").bind(rz!.id).all<Record<string, unknown>>();
  assert.equal(po.results.length, 1);
  const m = po.results[0];
  assert.equal(m.smjer, "izlaz");
  assert.equal(m.resend_id, "abc");
  assert.equal(m.poslao, null);
  assert.ok(!String(m.text).includes("#tok") && !String(m.html).includes("#tok"), "token pozivnice se ne sprema");
  assert.ok(String(m.text).includes(SKRIVENA_POVEZNICA));
  assert.equal(rz!.neprocitano, 0);
});

test("greška API-ja vraća razlog, ne baca", async () => {
  env.RESEND_API_KEY = "re_test";
  const r = await posaljiPozivnicu(P, (async () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 })) as typeof fetch);
  assert.deepEqual(r, { ok: false, razlog: "greska", detalj: "403 domain not verified" });
  const r2 = await posaljiPozivnicu(P, (async () => { throw new Error("mreža"); }) as typeof fetch);
  assert.equal(r2.ok, false);
  assert.equal(await broj("razgovori"), 0, "neuspjelo slanje ne ostavlja prazan razgovor");
  assert.equal(await broj("poruke"), 0);
});

test("bez baze (greška D1) pozivnica ipak ide, s rezervnim reply_to", async () => {
  env.RESEND_API_KEY = "re_test";
  env.DB = { prepare() { throw new Error("D1 nedostupan"); } } as unknown as D1Database;
  let b: Record<string, unknown> = {};
  const r = await posaljiPozivnicu(P, (async (_u: string, init: RequestInit) => {
    b = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ id: "x" }), { status: 200 });
  }) as unknown as typeof fetch);
  assert.deepEqual(r, { ok: true, id: "x" });
  assert.equal(b.reply_to, "bok@logomedo.com");
});

test("ime je escapano u HTML-u, link je u tekstu", () => {
  const s = sadrzajPozivnice(P);
  assert.ok(!s.html.includes("<b>"));
  assert.ok(s.html.includes("&lt;b&gt;"));
  assert.ok(s.text.includes("Pozdrav <b>Ana</b>,"));
  assert.ok(!/\{\{/.test(s.html + s.text), "svi placeholderi popunjeni");
  assert.ok(s.html.includes('href="https://logomedo.com/admin/poziv#tok"'));
});
