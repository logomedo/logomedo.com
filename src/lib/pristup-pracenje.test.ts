// Ekran nakon auto-odobravanja kuponom: praćenje, ponovno slanje (60 s, najviše 4) i „Mail nije stigao”.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import { HONEYPOT, ZIG, posalji } from "./pristup.ts";
import { stvori } from "./admin/kuponi.ts";
import { provjeri } from "./admin/pozivi.ts";
import {
  KOLACIC_PRACENJA, MAX_SLANJA, SAM_ZATRAZIO, kolacicPracenja, posaljiPonovno, procitajPracenje, stanjaOnboardinga, tokenIzKolacica, trebaPomoc,
} from "./pristup-pracenje.ts";

const SADA = new Date("2026-11-25T12:00:00.000Z");
const SA = "sa@primjer.test";
const za = (s: number) => new Date(SADA.getTime() + s * 1000);

beforeEach(() => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
  env.RESEND_API_KEY = "re_test";
  delete env.PRISTUP_TAJNA;
});
const db = () => env.DB as D1Database;

function obrazac(): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    [ZIG]: String(SADA.getTime() - 10_000), ime: "Ana Anić", email: "ana@vrtic.example.test", ustanova: "Vrtić Sunce", grad: "Zagreb",
    poruka: "", privola: "da", [HONEYPOT]: "", kupon: "BETA",
  })) f.set(k, v);
  return f;
}
function resend() {
  const poslano: Record<string, any>[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") { poslano.push(JSON.parse(String(init.body))); return Response.json({ id: `em_${poslano.length}` }); }
    return Response.json({ message_id: `<m${url.length}@primjer.test>` });
  }) as unknown as typeof fetch;
  return { f, poslano };
}
const linkIz = (m: Record<string, any>) => String(m.text).match(/admin\/poziv#([A-Za-z0-9_-]{43})/)![1];

async function odobreno() {
  await stvori({ kod: "BETA", autoOdobri: true, pogodnost: null }, SA, SADA);
  const r = resend();
  const ishod = await posalji(obrazac(), "203.0.113.7", SADA, r.f, "https://primjer.test");
  assert.equal(ishod.vrsta, "odobreno");
  return { token: (ishod as { pracenje: string }).pracenje, ...r };
}

test("kolačić: zapis i čitanje tokena", () => {
  const t = "a".repeat(43);
  assert.ok(kolacicPracenja(t).startsWith(`${KOLACIC_PRACENJA}=${t}; Path=/;`));
  assert.ok(kolacicPracenja(t).includes("HttpOnly; Secure; SameSite=Lax"));
  assert.equal(tokenIzKolacica(`x=1; ${KOLACIC_PRACENJA}=${t}; y=2`), t);
  assert.equal(tokenIzKolacica(`${KOLACIC_PRACENJA}=kratko`), null);
  assert.equal(tokenIzKolacica(null), null);
});

test("praćenje nakon kupona: e-mail, prvo slanje, čekanje 60 s; token u bazi samo kao hash", async () => {
  const { token } = await odobreno();
  const p = await procitajPracenje(token, za(10));
  assert.equal(p!.email, "ana@vrtic.example.test");
  assert.equal(p!.slanja, 1);
  assert.equal(p!.cekajSekundi, 50);
  assert.equal(p!.prijavljen, false);
  assert.equal(await db().prepare("SELECT count(*) AS n FROM zahtjevi_pristupa WHERE pracenje_hash = ?").bind(token).first("n"), 0);
  assert.equal(await procitajPracenje("b".repeat(43)), null);
  assert.equal(await procitajPracenje(token, za(73 * 3600)), null, "nakon 72 h ne vrijedi");
});

test("ponovno slanje: prerano odbijeno, nakon 60 s novi link (stari ne vrijedi), najviše 4 slanja", async () => {
  const { token, f, poslano } = await odobreno();
  const prvi = linkIz(poslano[0]);
  assert.deepEqual(await posaljiPonovno(token, "https://primjer.test", za(30), f), { ok: false, razlog: "rano" });
  assert.deepEqual(await posaljiPonovno(token, "https://primjer.test", za(61), f), { ok: true });
  assert.equal(poslano.length, 2);
  assert.deepEqual(poslano[1].to, ["ana@vrtic.example.test"]);
  assert.equal(await provjeri(prvi, za(62)), null, "stari link više ne vrijedi");
  assert.ok(await provjeri(linkIz(poslano[1]), za(62)));
  assert.equal(await db().prepare("SELECT stvorio FROM pozivi ORDER BY id DESC").first("stvorio"), SAM_ZATRAZIO);
  assert.equal(await db().prepare("SELECT poziv_token_hash IS NOT NULL AS h FROM zahtjevi_pristupa").first("h"), 1);
  assert.deepEqual(await posaljiPonovno(token, "https://primjer.test", za(122), f), { ok: true });
  assert.deepEqual(await posaljiPonovno(token, "https://primjer.test", za(183), f), { ok: true });
  assert.equal((await procitajPracenje(token, za(200)))!.slanja, MAX_SLANJA);
  assert.deepEqual(await posaljiPonovno(token, "https://primjer.test", za(300), f), { ok: false, razlog: "previse" });
  assert.deepEqual(await posaljiPonovno(null, "https://primjer.test", za(300), f), { ok: false, razlog: "nema" });
});

test("ponovno slanje kad je pozivnica već iskorištena: prijavljen", async () => {
  const { token, f } = await odobreno();
  await db().prepare("INSERT INTO korisnici (email, ime, uloga, aktivan) VALUES ('ana@vrtic.example.test', 'Ana', 'logoped', 1)").run();
  assert.equal((await procitajPracenje(token, za(70)))!.prijavljen, true);
  assert.deepEqual(await posaljiPonovno(token, "https://primjer.test", za(70), f), { ok: false, razlog: "prijavljen" });
});

test("„Mail nije stigao”: upis s kontaktom, jedna obavijest superadminu, vidi se u stanju onboardinga", async () => {
  const { token, f, poslano } = await odobreno();
  assert.equal(await trebaPomoc(token, "  091 123 4567 ", za(200), f), true);
  assert.equal(await trebaPomoc(token, "", za(300), f), true);
  const obavijesti = poslano.filter((m) => m.to?.includes(SA));
  assert.equal(obavijesti.length, 1);
  assert.equal(obavijesti[0].subject, "Pozivnica nije stigla");
  assert.ok(!JSON.stringify(obavijesti[0]).includes("ana@"), "obavijest bez adrese");
  const s = (await stanjaOnboardinga()).get("ana@vrtic.example.test")!;
  assert.equal(s.pomoc_at, za(200).toISOString());
  assert.equal(s.pomoc_kontakt, "091 123 4567");
  assert.equal(s.kupon, "BETA");
  assert.equal(await trebaPomoc("c".repeat(43), "", za(300), f), false);
});
