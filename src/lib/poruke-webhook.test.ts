// Resend webhook (src/lib/poruke-webhook.ts kroz rutu src/pages/api/resend/webhook.ts): potpis, vrsta događaja,
// idempotencija, dohvat tijela i privitaka (fetch ubačen, bez mreže), granice, bez RESEND_API_KEY, greška Resenda.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import { potpisi } from "./svix.ts";
import { primiWebhook, PRIVITAK_MAX, r2KljucPrivitka } from "./poruke-webhook.ts";
import { adresaZaOdgovor, noviRazgovor } from "./poruke.ts";
import { POST } from "../pages/api/resend/webhook.ts";

const TAJNA = "whsec_" + btoa("testni-kljuc-za-webhook-32-bajta");
const SADA = Date.parse("2026-11-19T12:00:00.000Z");

let r2: Map<string, { tijelo: ArrayBuffer; tip?: string }>;
beforeEach(() => {
  env.DB = napraviD1();
  env.RESEND_WEBHOOK_SECRET = TAJNA;
  delete env.RESEND_API_KEY;
  r2 = new Map();
  env.SLIKE = { put: async (k: string, b: ArrayBuffer, o?: { httpMetadata?: { contentType?: string } }) => { r2.set(k, { tijelo: b, tip: o?.httpMetadata?.contentType }); } };
});
const db = () => env.DB as D1Database;
const broj = async (t: string) => (await db().prepare(`SELECT COUNT(*) AS c FROM ${t}`).first<{ c: number }>())!.c;

const dogadjaj = (data: Record<string, unknown> = {}, type = "email.received") => JSON.stringify({
  type, created_at: "2026-11-19T11:59:00.000Z",
  data: {
    email_id: "em_1", created_at: "2026-11-19T11:59:00.000Z", from: "ana@primjer.test", to: ["bok@primjer.test"],
    cc: [], bcc: [], received_for: [], message_id: "<m1@primjer.test>", subject: "Re: Pozivnica", attachments: [], ...data,
  },
});

async function zahtjev(tijelo: string, o: { tajna?: string; vrijeme?: number; id?: string } = {}): Promise<Request> {
  const vrijeme = Math.floor((o.vrijeme ?? SADA) / 1000);
  const id = o.id ?? "msg_1";
  return new Request("https://logomedo.com/api/resend/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": String(vrijeme), "svix-signature": await potpisi(o.tajna ?? TAJNA, id, vrijeme, tijelo) },
    body: tijelo,
  });
}

type Poziv = { url: string; auth: string | null };
function lazniResend(o: { mail?: Record<string, unknown>; privitci?: Record<string, unknown>[]; datoteke?: Record<string, Uint8Array<ArrayBuffer>>; status?: number } = {}) {
  const pozivi: Poziv[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
    pozivi.push({ url, auth });
    if (o.status) return new Response("{}", { status: o.status });
    if (url.startsWith("https://cdn.primjer.test/")) {
      const d = o.datoteke?.[url];
      return d ? new Response(d) : new Response("", { status: 404 });
    }
    if (/\/attachments\?/.test(url)) return Response.json({ object: "list", has_more: false, data: o.privitci ?? [] });
    if (/\/emails\/receiving\/[^/]+\?html_format=cid$/.test(url)) {
      return Response.json({ id: "em_1", text: "Hvala, stiglo je.", html: "<p>Hvala</p>", headers: { From: "Ana Horvat <ana@primjer.test>", "In-Reply-To": "<izlaz@primjer.test>", References: "<prvi@primjer.test> <izlaz@primjer.test>" }, ...o.mail });
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { f, pozivi };
}

test("ruta: nepotpisan zahtjev 401, ništa upisano", async () => {
  const r = await POST({ request: new Request("https://logomedo.com/api/resend/webhook", { method: "POST", body: dogadjaj() }) } as never);
  assert.equal(r.status, 401);
  assert.equal(await broj("poruke"), 0);
});

test("pogrešan ključ, star žig, promijenjeno tijelo → 401", async () => {
  assert.equal((await primiWebhook(await zahtjev(dogadjaj(), { tajna: "whsec_" + btoa("drugi") }), undefined, SADA)).status, 401);
  assert.equal((await primiWebhook(await zahtjev(dogadjaj(), { vrijeme: SADA - 10 * 60_000 }), undefined, SADA)).status, 401);
  const z = await zahtjev(dogadjaj());
  const izmijenjen = new Request(z.url, { method: "POST", headers: z.headers, body: dogadjaj({ subject: "drugo" }) });
  const r = await primiWebhook(izmijenjen, undefined, SADA);
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: "potpis", razlog: "potpis" });
  assert.equal(await broj("poruke"), 0);
});

test("bez RESEND_WEBHOOK_SECRET 503", async () => {
  delete env.RESEND_WEBHOOK_SECRET;
  assert.equal((await primiWebhook(await zahtjev(dogadjaj()), undefined, SADA)).status, 503);
});

test("druga vrsta događaja: 200 i ništa", async () => {
  const r = await primiWebhook(await zahtjev(dogadjaj({}, "email.delivered")), undefined, SADA);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, preskoceno: "email.delivered" });
  assert.equal(await broj("poruke"), 0);
});

test("neispravan JSON ili bez email_id: 400", async () => {
  assert.equal((await primiWebhook(await zahtjev("{"), undefined, SADA)).status, 400);
  assert.equal((await primiWebhook(await zahtjev(dogadjaj({ email_id: undefined })), undefined, SADA)).status, 400);
});

test("bez RESEND_API_KEY: metapodaci, tijelo_fali, privitci bez R2, mreža se ne zove", async () => {
  const { f, pozivi } = lazniResend();
  const r = await primiWebhook(await zahtjev(dogadjaj({ attachments: [{ id: "a1", filename: "slika.jpg", content_type: "image/jpeg" }] })), f, SADA);
  assert.equal(r.status, 200);
  assert.equal(pozivi.length, 0);
  const p = await db().prepare("SELECT * FROM poruke").first<Record<string, unknown>>();
  assert.equal(p!.tijelo_fali, 1);
  assert.equal(p!.text, null);
  assert.equal(p!.od, "ana@primjer.test");
  assert.equal(p!.predmet, "Re: Pozivnica");
  const pr = await db().prepare("SELECT * FROM privitci").first<Record<string, unknown>>();
  assert.equal(pr!.r2_kljuc, null);
  assert.equal(pr!.ime, "slika.jpg");
  assert.equal(r2.size, 0);
});

test("isti email_id dvaput: jedna poruka", async () => {
  const tijelo = dogadjaj();
  assert.equal((await primiWebhook(await zahtjev(tijelo), undefined, SADA)).status, 200);
  const drugi = await primiWebhook(await zahtjev(tijelo, { id: "msg_2" }), undefined, SADA);
  assert.equal(drugi.status, 200);
  assert.deepEqual(await drugi.json(), { ok: true, duplikat: true });
  assert.equal(await broj("poruke"), 1);
});

test("s ključem: tijelo, zaglavlja niti, ime pošiljatelja, nit po adresi, privitci u R2 i granice", async () => {
  env.RESEND_API_KEY = "re_test";
  const raz = await noviRazgovor({ email: "ana@primjer.test", sada: "2026-11-19T09:00:00.000Z" });
  const slika = new Uint8Array([1, 2, 3]);
  const { f, pozivi } = lazniResend({
    privitci: [
      { id: "a1", filename: "slika.jpg", content_type: "image/jpeg; name=slika.jpg", size: 3, content_id: "<img1>", download_url: "https://cdn.primjer.test/a1?signature=x" },
      { id: "a2", filename: "virus.exe", content_type: "application/x-msdownload", size: 10, download_url: "https://cdn.primjer.test/a2" },
      { id: "a3", filename: "film.pdf", content_type: "application/pdf", size: PRIVITAK_MAX + 1, download_url: "https://cdn.primjer.test/a3" },
    ],
    datoteke: { "https://cdn.primjer.test/a1?signature=x": slika },
  });
  const r = await primiWebhook(await zahtjev(dogadjaj({ to: [adresaZaOdgovor(raz.kljuc)], attachments: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] })), f, SADA);
  assert.equal(r.status, 200);
  const j = (await r.json()) as { razgovor: number };
  assert.equal(j.razgovor, raz.id);

  const p = await db().prepare("SELECT * FROM poruke").first<Record<string, unknown>>();
  assert.equal(p!.text, "Hvala, stiglo je.");
  assert.equal(p!.html, "<p>Hvala</p>");
  assert.equal(p!.tijelo_fali, 0);
  assert.equal(p!.od, "Ana Horvat <ana@primjer.test>");
  assert.equal(p!.in_reply_to, "<izlaz@primjer.test>");
  assert.equal(p!.reference, "<prvi@primjer.test> <izlaz@primjer.test>");
  assert.equal(p!.message_id, "<m1@primjer.test>");

  const pr = (await db().prepare("SELECT * FROM privitci ORDER BY id").all<Record<string, unknown>>()).results;
  assert.deepEqual(pr.map((x) => [x.ime, x.tip, x.r2_kljuc, x.napomena]), [
    ["slika.jpg", "image/jpeg", r2KljucPrivitka("em_1", "a1"), null],
    ["virus.exe", "application/x-msdownload", null, "tip nije dopušten"],
    ["film.pdf", "application/pdf", null, "prevelik"],
  ]);
  assert.equal(pr[0].content_id, "<img1>");
  assert.deepEqual(new Uint8Array(r2.get("poruke/em_1/a1")!.tijelo), slika);
  assert.equal(r2.get("poruke/em_1/a1")!.tip, "image/jpeg");
  // Resend API dobiva ključ, potpisani URL privitka ne; odbijeni privitci se ne skidaju.
  for (const p of pozivi) assert.equal(p.auth, p.url.startsWith("https://api.resend.com/") ? "Bearer re_test" : null, p.url);
  assert.deepEqual(pozivi.filter((p) => p.url.startsWith("https://cdn.")).map((p) => p.url), ["https://cdn.primjer.test/a1?signature=x"]);
});

test("nit po In-Reply-To kad adresa nema ključ", async () => {
  env.RESEND_API_KEY = "re_test";
  const raz = await noviRazgovor({ email: "druga@primjer.test", sada: "2026-11-19T09:00:00.000Z" });
  await db().prepare("INSERT INTO poruke (razgovor_id, smjer, message_id, od, za, created_at) VALUES (?, 'izlaz', '<izlaz@primjer.test>', 'x', 'y', 't')").bind(raz.id).run();
  const r = await primiWebhook(await zahtjev(dogadjaj()), lazniResend().f, SADA);
  assert.equal(((await r.json()) as { razgovor: number }).razgovor, raz.id);
});

test("Resend API ne odgovara: 502 i ništa upisano (Svix ponovi)", async () => {
  env.RESEND_API_KEY = "re_test";
  const r = await primiWebhook(await zahtjev(dogadjaj()), lazniResend({ status: 500 }).f, SADA);
  assert.equal(r.status, 502);
  assert.equal(await broj("poruke"), 0);
  assert.equal(await broj("razgovori"), 0);
});

test("predug tekst se skraćuje, predug HTML ne sprema", async () => {
  env.RESEND_API_KEY = "re_test";
  const { f } = lazniResend({ mail: { text: "a".repeat(200_001), html: "<p>" + "b".repeat(600_000) } });
  await primiWebhook(await zahtjev(dogadjaj()), f, SADA);
  const p = await db().prepare("SELECT length(text) AS t, html, napomena FROM poruke").first<Record<string, unknown>>();
  assert.equal(p!.t, 200_000);
  assert.equal(p!.html, null);
  assert.equal(p!.napomena, "tekst skraćen; HTML predug, nije spremljen");
});
