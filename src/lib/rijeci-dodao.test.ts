// `rijeci.dodao` (docs/rbac/, S4): upisuje se gdje riječ nastaje u adminu; ponovna aktivacija ne
// prepisuje postojećeg autora, a riječ koja je već aktivna ga ne dobiva. Prikaz: katalog.rijec.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import { POST as rijeciPost } from "../pages/admin/api/rijeci.ts";
import { POST as novaRijecPost } from "../pages/admin/api/nova-rijec.ts";
import { noviZnak } from "./znakovi-baza.ts";
import { napraviBozicnu } from "./biljeznice.ts";
import { rijec as detalj } from "./katalog.ts";

const SA = "a@primjer.hr";
const ANA = "ana@primjer.hr";

beforeEach(async () => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
  await db().prepare("INSERT INTO korisnici (email, ime, uloga) VALUES (?, 'Ana', 'logoped')").bind(ANA).run();
});

const db = () => env.DB as D1Database;
const dodao = (r: string) => db().prepare("SELECT dodao FROM rijeci WHERE rijec = ?").bind(r).first<string | null>("dodao");
const ctx = (email: string, request: Request) => ({ request, locals: { admin: { email, uloga: email === SA ? "superadmin" : "logoped" } } }) as never;
const izEditora = (email: string, rijec: string) =>
  rijeciPost(ctx(email, new Request("http://x/admin/api/rijeci", { method: "POST", body: JSON.stringify({ rijec }) })));
const izKataloga = (email: string, rijec: string) => {
  const f = new FormData();
  f.set("rijec", rijec);
  return novaRijecPost(ctx(email, new Request("http://x/admin/api/nova-rijec", { method: "POST", body: f })));
};

test("editor zadatka: nova riječ dobiva autora; aktivna postojeća (seed) ga ne dobiva", async () => {
  assert.equal((await izEditora("Ana@Primjer.hr", "gugutka")).status, 200);
  assert.equal(await dodao("gugutka"), ANA, "e-mail malim slovima");
  await db().prepare("INSERT INTO rijeci (rijec, slug) VALUES ('pomfrit', 'pomfrit')").run();
  assert.equal((await izEditora(SA, "pomfrit")).status, 200);
  assert.equal(await dodao("pomfrit"), null, "aktivna riječ iz seeda ostaje bez autora");
});

test("ponovna aktivacija: postojeći autor se ne prepisuje; neaktivna bez autora ga dobiva", async () => {
  await izEditora(ANA, "gugutka");
  await db().prepare("UPDATE rijeci SET aktivna = 0 WHERE rijec = 'gugutka'").run();
  await izEditora(SA, "gugutka");
  assert.equal(await dodao("gugutka"), ANA);
  assert.equal(await db().prepare("SELECT aktivna FROM rijeci WHERE rijec = 'gugutka'").first<number>("aktivna"), 1);

  await db().prepare("INSERT INTO rijeci (rijec, slug, aktivna) VALUES ('pomfrit', 'pomfrit', 0)").run();
  await izEditora(SA, "pomfrit");
  assert.equal(await dodao("pomfrit"), SA);
});

test("nova riječ iz kataloga: autor; ponovna aktivacija ga ne prepisuje; detalj vraća ime", async () => {
  const odg = await izKataloga(ANA, "trampolin");
  assert.equal(odg.status, 303);
  assert.match(odg.headers.get("location") ?? "", /^\/admin\/rijec\/trampolin\?nova=1/);
  assert.equal(await dodao("trampolin"), ANA);
  await db().prepare("UPDATE rijeci SET aktivna = 0 WHERE rijec = 'trampolin'").run();
  await izKataloga(SA, "trampolin");
  assert.equal(await dodao("trampolin"), ANA);

  const d = await detalj("trampolin");
  assert.equal(d?.dodao, ANA);
  assert.equal(d?.dodao_ime, "Ana");
  await izKataloga(SA, "kvačica");
  assert.deepEqual([(await detalj("kvachica"))?.dodao, (await detalj("kvachica"))?.dodao_ime], [SA, null], "superadmin bez retka: samo e-mail");
});

test("znak i božićna bilježnica: autor upisan, postojeći se ne prepisuje", async () => {
  assert.ok("id" in (await noviZnak("q", ANA)));
  assert.equal(await dodao("q"), ANA);

  await db().prepare("UPDATE rijeci SET dodao = ?, aktivna = 0 WHERE rijec = 'bor'").bind(ANA).run(); // bor je iz seeda
  await napraviBozicnu(SA).catch(() => {}); // ostatak (zadaci, red) ovdje nije bitan; riječi su prvi batch
  assert.equal(await dodao("bor"), ANA);
  assert.equal(await dodao("šator"), SA);
  assert.equal(await db().prepare("SELECT aktivna FROM rijeci WHERE rijec = 'bor'").first<number>("aktivna"), 1);
});
