// Novi razgovor iz admina (S4): validacija, prvi mail bez „Re:” i bez In-Reply-To, reply_to razgovora, upis;
// neuspjeh briše prazan razgovor; ponovljeni ključ obrasca vraća isti razgovor bez praznog viška. Bez mreže.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { env } from "./test/cloudflare-workers.ts";
import { napraviD1 } from "./test/d1.ts";
import { POSILJATELJ_ODGOVORA, posaljiNoviRazgovor } from "./email.ts";
import { kljucIzAdrese } from "./poruke.ts";

beforeEach(() => { env.DB = napraviD1(); env.RESEND_API_KEY = "re_test"; });
const db = () => env.DB as D1Database;
const broj = async (t: string) => (await db().prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())!.n;

const N = { email: " Ana@Primjer.TEST ", ime: "Ana Horvat", predmet: "Vaš zahtjev za pristup", tekst: "Pozdrav Ana,\n\nimam pitanje.", poslao: "sa@primjer.test", kljucSlanja: "11111111-2222-3333-4444-555555555555" };

function lazni(o: { status?: number; id?: string } = {}) {
  const posta: { body: Record<string, unknown>; zaglavlja: Record<string, string> }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      posta.push({ body: JSON.parse(String(init.body)), zaglavlja: init.headers as Record<string, string> });
      return new Response(JSON.stringify(o.status ? { message: "x" } : { id: o.id ?? "em_novi" }), { status: o.status ?? 200 });
    }
    return Response.json({ id: o.id ?? "em_novi", message_id: "<novi@eu-west-1.amazonses.com>" });
  }) as unknown as typeof fetch;
  return { f, posta };
}

test("validacija prije ikakvog upisa i mreže", async () => {
  const { f, posta } = lazni();
  assert.deepEqual(await posaljiNoviRazgovor({ ...N, email: "nije-email" }, f, 0), { ok: false, razlog: "email" });
  assert.deepEqual(await posaljiNoviRazgovor({ ...N, predmet: "  " }, f, 0), { ok: false, razlog: "predmet" });
  assert.deepEqual(await posaljiNoviRazgovor({ ...N, tekst: " \n " }, f, 0), { ok: false, razlog: "prazno" });
  delete env.RESEND_API_KEY;
  assert.deepEqual(await posaljiNoviRazgovor(N, f, 0), { ok: false, razlog: "nema_kljuca" });
  assert.equal(posta.length, 0);
  assert.equal(await broj("razgovori"), 0);
});

test("šalje prvi mail i upisuje razgovor", async () => {
  const { f, posta } = lazni();
  const r = await posaljiNoviRazgovor(N, f, 0);
  assert.ok(r.ok);
  const raz = await db().prepare("SELECT * FROM razgovori WHERE id = ?").bind(r.razgovorId).first<Record<string, unknown>>();
  assert.equal(raz!.email, "ana@primjer.test");
  assert.equal(raz!.ime, "Ana Horvat");
  assert.equal(raz!.predmet, "Vaš zahtjev za pristup");
  const b = posta[0].body;
  assert.equal(b.from, POSILJATELJ_ODGOVORA);
  assert.deepEqual(b.to, ["Ana Horvat <ana@primjer.test>"]);
  assert.equal(b.subject, "Vaš zahtjev za pristup", "bez Re:");
  assert.equal(b.headers, undefined, "nema In-Reply-To");
  assert.equal(kljucIzAdrese(String(b.reply_to)), raz!.kljuc);
  assert.equal(posta[0].zaglavlja["Idempotency-Key"], `novi-${N.kljucSlanja}`);
  const p = await db().prepare("SELECT * FROM poruke").first<Record<string, unknown>>();
  assert.equal(p!.smjer, "izlaz");
  assert.equal(p!.poslao, "sa@primjer.test");
  assert.equal(p!.message_id, "<novi@eu-west-1.amazonses.com>");
});

test("neuspjelo slanje: nema razgovora", async () => {
  const { f } = lazni({ status: 500 });
  const r = await posaljiNoviRazgovor(N, f, 0);
  assert.equal(r.ok, false);
  assert.equal(await broj("razgovori"), 0);
});

test("ponovljeni POST s istim ključem: isti razgovor, bez praznog viška", async () => {
  const { f } = lazni();
  const a = await posaljiNoviRazgovor(N, f, 0);
  const b = await posaljiNoviRazgovor(N, f, 0); // Resend vrati isti id
  assert.ok(a.ok && b.ok);
  assert.equal(b.razgovorId, a.razgovorId);
  assert.equal(await broj("razgovori"), 1);
  assert.equal(await broj("poruke"), 1);
});
