// Nepoželjne riječi (migracija 0036): popis s razlogom; nova riječ s popisa se ne dodaje.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import { dodajNepozeljnu, makniNepozeljnu, nepozeljna, normalizirajRijec, sveNepozeljne } from "./nepozeljne.ts";
import { POST as novaRijecPost } from "../pages/admin/api/nova-rijec.ts";

const SA = "a@primjer.hr";
beforeEach(() => { env.DB = napraviD1(); env.ADMIN_EMAILS = SA; });
const db = () => env.DB as D1Database;

const novaRijec = (rijec: string) => {
  const f = new FormData();
  f.set("rijec", rijec);
  return novaRijecPost({ request: new Request("http://x/admin/api/nova-rijec", { method: "POST", body: f }),
    locals: { admin: { email: SA, uloga: "superadmin" } } } as never);
};

test("normalizacija kao nova riječ", () => {
  assert.equal(normalizirajRijec("  ŽEĐ "), "žeđ");
  assert.equal(normalizirajRijec("Morski   Pas"), "morski pas");
});

test("dodaj, promijeni razlog (prazan ga ne briše), makni", async () => {
  assert.equal(await dodajNepozeljnu(" ŽEĐ ", "teško se crta", SA), "žeđ");
  assert.equal(await dodajNepozeljnu("žeđ", "", SA), "žeđ");
  assert.equal((await nepozeljna("Žeđ"))?.razlog, "teško se crta");
  await dodajNepozeljnu("žeđ", "nije za djecu", SA);
  const [n] = await sveNepozeljne();
  assert.equal(n.razlog, "nije za djecu");
  assert.equal(await dodajNepozeljnu("   ", "x", SA), null);
  await makniNepozeljnu(n.id);
  assert.equal(await nepozeljna("žeđ"), null);
});

test("nova riječ s popisa se ne dodaje, poruka nosi razlog", async () => {
  await dodajNepozeljnu("žeđ", "teško se crta", SA);
  const odg = await novaRijec("Žeđ");
  assert.equal(odg.status, 303);
  const kamo = new URL(odg.headers.get("location")!, "http://x");
  assert.equal(kamo.pathname, "/admin/nova-rijec");
  assert.match(kamo.searchParams.get("greska")!, /nepoželjnih riječi: teško se crta/);
  assert.equal(await db().prepare("SELECT COUNT(*) AS n FROM rijeci WHERE rijec = 'žeđ'").first("n"), 0);
  assert.notEqual((await novaRijec("lađa")).headers.get("location"), null);
  assert.equal(await db().prepare("SELECT COUNT(*) AS n FROM rijeci WHERE rijec = 'lađa'").first("n"), 1);
});
