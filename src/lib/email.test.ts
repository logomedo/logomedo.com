// Pozivnica e-poštom (Resend): bez ključa ne šalje, uspjeh i greška API-ja, escapanje imena. Bez mreže.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { env } from "./test/cloudflare-workers.ts";
import { POSILJATELJ, posaljiPozivnicu, sadrzajPozivnice } from "./email.ts";

const P = { email: "logoped@primjer.test", ime: "<b>Ana</b> Horvat", url: "https://logomedo.com/admin/poziv#tok", istjece: "2026-11-22T12:00:00.000Z" };

beforeEach(() => { delete env.RESEND_API_KEY; });

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
});

test("greška API-ja vraća razlog, ne baca", async () => {
  env.RESEND_API_KEY = "re_test";
  const r = await posaljiPozivnicu(P, (async () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 })) as typeof fetch);
  assert.deepEqual(r, { ok: false, razlog: "greska", detalj: "403 domain not verified" });
  const r2 = await posaljiPozivnicu(P, (async () => { throw new Error("mreža"); }) as typeof fetch);
  assert.equal(r2.ok, false);
});

test("ime je escapano u HTML-u, link je u tekstu", () => {
  const s = sadrzajPozivnice(P);
  assert.ok(!s.html.includes("<b>"));
  assert.ok(s.html.includes("&lt;b&gt;"));
  assert.ok(s.text.includes("Pozdrav <b>Ana</b>,"));
  assert.ok(!/\{\{/.test(s.html + s.text), "svi placeholderi popunjeni");
  assert.ok(s.html.includes('href="https://logomedo.com/admin/poziv#tok"'));
});
