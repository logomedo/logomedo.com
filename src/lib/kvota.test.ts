// AI kvota (docs/rbac/decisions.md, odluka 10) nad pravom shemom (napraviD1, sve migracije):
// granica, utrka, superadmin, deaktivirani logoped, poruka, i točke troška kroz stvarne funkcije.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import {
  batchSKvotom, kadSeOslobada, kadTekst, KvotaPrekoracena, odgovorNaKvotu, platitelj, porukaKvote, preostalo, provjeri,
} from "./kvota.ts";
import { dodajURed, neuspjeleURed } from "./generiranje.ts";
import { stil } from "./katalog.ts";
import { dodajZvukove, greskeURed, odbijZvukove, ponoviZvuk } from "./zvukovi.ts";
import { ponovi, zatrazi } from "./pozadine-generiranje.ts";
import * as aktivnost from "./aktivnost.ts";

const SA = "a@primjer.hr";
const ANA = "ana@primjer.hr";

const db = () => env.DB as D1Database;
let ana = 0;
let poslano: number[] = [];

const broj = (sql: string, ...args: unknown[]) => db().prepare(sql).bind(...args).first<number>("n") as Promise<number>;
const poslova = () => broj("SELECT COUNT(*) AS n FROM generiranja");
const potroseno = (id: number, vrsta = "slike") =>
  broj("SELECT COALESCE(SUM(kolicina), 0) AS n FROM ai_potrosnja WHERE korisnik_id = ? AND vrsta = ?", id, vrsta);
const limit = (id: number, slike: number, zvukovi = 200) =>
  db().prepare("UPDATE korisnici SET limit_slike_7d = ?, limit_zvukovi_7d = ? WHERE id = ?").bind(slike, zvukovi, id).run();
async function rijeci(n: number): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = `r${ids.length}x${Math.random().toString(36).slice(2, 8)}`;
    ids.push((await db().prepare("INSERT INTO rijeci (rijec, slug) VALUES (?, ?) RETURNING id").bind(r, r).first<number>("id"))!);
  }
  return ids;
}
const odbijena = (e: unknown) => e instanceof KvotaPrekoracena;

beforeEach(async () => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
  env.RUNNER_ZVONO = { getByName: () => ({ zvoni: async () => {} }) };
  poslano = [];
  env.ZVUKOVI_RED = { sendBatch: async (m: { body: { posao: number } }[]) => { poslano.push(...m.map((x) => x.body.posao)); } };
  await db().prepare("INSERT INTO stilovi (kod, naziv, predlozak) VALUES ('bojanka', 'Bojanka', 'draw {rijec}: {opis}')").run();
  ana = (await db().prepare("INSERT INTO korisnici (email, uloga) VALUES (?, 'logoped') RETURNING id").bind(ANA).first<number>("id"))!;
});

test("granica: n = preostalo prolazi, n+1 ne i ništa nije upisano", async () => {
  await limit(ana, 3);
  const s = await stil("bojanka");
  await assert.rejects(dodajURed(s, await rijeci(4), ANA), odbijena);
  assert.equal(await poslova(), 0);
  assert.equal(await potroseno(ana), 0);
  assert.equal(await broj("SELECT COUNT(*) AS n FROM aktivnost"), 0);

  assert.equal(await dodajURed(s, await rijeci(3), ANA), 3);
  assert.equal(await poslova(), 3);
  assert.equal(await potroseno(ana), 3);
  assert.deepEqual((await preostalo(ana)).slike, { limit: 3, potroseno: 3, preostalo: 0 });
  // Riječi već u redu se ne naplaćuju (nema upisa), pa ni ne prelaze limit.
  const { results } = await db().prepare("SELECT rijec_id FROM generiranja").all<{ rijec_id: number }>();
  assert.equal(await dodajURed(s, results.map((r) => r.rijec_id), ANA), 0);
});

test("dodajURed: više od 50 riječi je jedan batch, pa prekoračenje ne propušta prvi dio", async () => {
  await limit(ana, 60);
  const s = await stil("bojanka");
  await assert.rejects(dodajURed(s, await rijeci(61), ANA), odbijena);
  assert.equal(await poslova(), 0);
  assert.equal(await dodajURed(s, await rijeci(60), ANA), 60);
});

test("dva batcha zaredom kad je ostalo 1: prolazi samo jedan", async () => {
  await limit(ana, 1);
  const [a, b] = await rijeci(2);
  const s = await stil("bojanka");
  const posao = (r: number) =>
    db().prepare("INSERT INTO generiranja (rijec_id, stil_id, prompt, zatrazio) VALUES (?, ?, 'p', ?)").bind(r, s.id, ANA);
  const ishodi = await Promise.allSettled([
    batchSKvotom(ANA, "slike", 1, "test", [posao(a)]),
    batchSKvotom(ANA, "slike", 1, "test", [posao(b)]),
  ]);
  assert.deepEqual(ishodi.map((x) => x.status).sort(), ["fulfilled", "rejected"]);
  assert.ok((ishodi.find((x) => x.status === "rejected") as PromiseRejectedResult).reason instanceof KvotaPrekoracena);
  assert.equal(await poslova(), 1);
  assert.equal(await potroseno(ana), 1);
});

test("superadmin: bez limita, potrošnja se bilježi (redak 'admin' nastaje)", async () => {
  const p = await platitelj(SA);
  assert.equal(p?.uloga, "superadmin");
  await limit(p!.korisnikId, 0);
  assert.equal(await dodajURed(await stil("bojanka"), await rijeci(5), SA), 5);
  assert.equal(await potroseno(p!.korisnikId), 5);
  await provjeri(SA, "slike", 1000);
});

test("deaktivirani logoped i nepoznat e-mail: ništa upisano", async () => {
  await db().prepare("UPDATE korisnici SET aktivan = 0 WHERE id = ?").bind(ana).run();
  const s = await stil("bojanka");
  await assert.rejects(dodajURed(s, await rijeci(1), ANA), (e) => e instanceof KvotaPrekoracena && e.limit === 0);
  await assert.rejects(dodajURed(s, await rijeci(1), "nitko@primjer.hr"), odbijena);
  assert.equal(await poslova(), 0);
  assert.equal(await broj("SELECT COUNT(*) AS n FROM ai_potrosnja"), 0);
  assert.equal(await platitelj(ANA), null);
});

test("kadSeOslobada: najstariji upis u prozoru + 7 dana; stariji od 7 dana se ne broji", async () => {
  assert.equal(await kadSeOslobada(ana, "slike"), null);
  await db().prepare(
    `INSERT INTO ai_potrosnja (korisnik_id, vrsta, kolicina, at) VALUES
       (?1, 'slike', 40, datetime('now', '-8 days')), (?1, 'slike', 30, datetime('now', '-6 days')),
       (?1, 'slike', 17, datetime('now', '-1 hours')), (?1, 'zvukovi', 5, datetime('now', '-2 days'))`,
  ).bind(ana).run();
  const kad = await kadSeOslobada(ana, "slike");
  assert.ok(kad && Math.abs(kad.getTime() - (Date.now() + 864e5)) < 120_000);
  assert.deepEqual(await preostalo(ana), {
    slike: { limit: 50, potroseno: 47, preostalo: 3 }, zvukovi: { limit: 200, potroseno: 5, preostalo: 195 },
  });
});

test("poruka: preostalo, limit i kad se vraćaju krediti po zagrebačkom vremenu", async () => {
  const kad = new Date("2026-11-18T13:05:00Z");
  assert.equal(kadTekst(kad), "srijedu 18. 11. u 14:05");
  assert.equal(kadTekst(new Date("2026-07-05T08:30:00Z")), "nedjelju 5. 7. u 10:30");
  assert.equal(porukaKvote({ vrsta: "slike", trazeno: 1, preostalo: 3, limit: 50, oslobadaSe: kad }),
    "Ostalo ti je 3 od 50 slika; prvi krediti vraćaju se u srijedu 18. 11. u 14:05.");
  assert.equal(porukaKvote({ vrsta: "zvukovi", trazeno: 5, preostalo: 0, limit: 200, oslobadaSe: null }),
    "Ostalo ti je 0 od 200 izgovora (ovo traži 5).");

  await limit(ana, 2);
  const s = await stil("bojanka");
  await dodajURed(s, await rijeci(1), ANA);
  await assert.rejects(dodajURed(s, await rijeci(4), ANA), (e) => {
    assert.ok(e instanceof KvotaPrekoracena);
    assert.equal(e.trazeno, 4);
    assert.equal(e.preostalo, 1);
    assert.equal(e.limit, 2);
    assert.ok(e.oslobadaSe && Math.abs(e.oslobadaSe.getTime() - (Date.now() + 7 * 864e5)) < 120_000);
    assert.match(e.poruka, /^Ostalo ti je 1 od 2 slika \(ovo traži 4\); prvi krediti vraćaju se u \S+ \d+\. \d+\. u \d\d:\d\d\.$/);
    return true;
  });
});

// ── Točke troška ─────────────────────────────────────────────────────────────────────────────

async function situacija(): Promise<number> {
  const id = (await db().prepare("INSERT INTO pozadine (naziv, autor_id) VALUES ('Kuhinja', ?) RETURNING id").bind(ana).first<number>("id"))!;
  await db().prepare(
    `INSERT INTO pozadina_slike (pozadina_id, orijentacija, r2_kljuc, sha256, mime, bajtova, sirina, visina, ucitao)
     VALUES (?, 'uspravno', ?, 'h', 'image/png', 1, 600, 900, 'x')`,
  ).bind(id, `pozadine/${id}/a.png`).run();
  return id;
}

test("zatrazi (situacija): „već u redu” ne naplaćuje ni kad kvote nema", async () => {
  await limit(ana, 1);
  const id = await situacija();
  assert.deepEqual(await zatrazi(id, ANA), { ok: true, u: "vodoravno" });
  assert.deepEqual(await zatrazi(id, ANA), { greska: "Generiranje je već u redu." });
  assert.equal(await potroseno(ana), 1);
  assert.equal(await broj("SELECT COUNT(*) AS n FROM pozadina_generiranja"), 1);

  // Neuspjeli posao: ponovi bez kredita je odbijen, s kreditom prolazi.
  await db().prepare("UPDATE pozadina_generiranja SET status = 'greska'").run();
  await assert.rejects(ponovi(id, ANA), odbijena);
  assert.equal(await broj("SELECT COUNT(*) AS n FROM pozadina_generiranja"), 1);
  await limit(ana, 2);
  assert.equal(await ponovi(id, ANA), true);
  assert.equal(await potroseno(ana), 2);
});

test("dodajZvukove: preko limita ništa u bazi ni u Queueu; unutar limita sve", async () => {
  await limit(ana, 50, 2);
  await assert.rejects(dodajZvukove(["mama", "tata", "baka"], ANA), odbijena);
  assert.equal(await broj("SELECT COUNT(*) AS n FROM zvuk_generiranja"), 0);
  assert.deepEqual(poslano, []);
  assert.equal(await dodajZvukove(["mama", "tata"], ANA), 2);
  assert.equal(poslano.length, 2);
  assert.equal(await potroseno(ana, "zvukovi"), 2);
  // Već u redu: ništa novo, ništa naplaćeno.
  assert.equal(await dodajZvukove(["mama", "tata"], ANA), 0);
  assert.equal(await ponoviZvuk("mama", ANA), false);
  assert.equal(await potroseno(ana, "zvukovi"), 2);
});

async function kandidat(kljuc: string): Promise<number> {
  return (await db().prepare(
    `INSERT INTO zvukovi (kljuc, izgovor, r2_kljuc, bajtova, glas_id, model, provjera) VALUES (?, ?, ?, 1, 'g', 'm', 'ok') RETURNING id`,
  ).bind(kljuc, kljuc, `zvuk/${kljuc}.mp3`).first<number>("id"))!;
}

test("odbijZvukove s ponovnim snimanjem: bez kredita se ne odbija ni snimka; naplata samo za novi posao", async () => {
  await limit(ana, 50, 0);
  const a = await kandidat("mama");
  const b = await kandidat("mama");
  await assert.rejects(odbijZvukove([a], ANA, { ponovo: true }).then(() => odbijZvukove([a, b], ANA, { ponovo: true })), odbijena);
  // Prvi poziv: „mama” ima još kandidata b, pa nema posla ni naplate; drugi traži posao i pada cijeli.
  assert.equal(await broj("SELECT COUNT(*) AS n FROM zvukovi WHERE status = 'kandidat'"), 1);
  assert.equal(await broj("SELECT COUNT(*) AS n FROM zvuk_generiranja"), 0);
  await limit(ana, 50, 1);
  assert.equal(await odbijZvukove([b], ANA, { ponovo: true }), 1);
  assert.equal(await broj("SELECT COUNT(*) AS n FROM zvuk_generiranja WHERE varijante = 1"), 1);
  assert.equal(poslano.length, 1);
  assert.equal(await potroseno(ana, "zvukovi"), 1);
  // „Samo odbij” nije AI posao.
  await limit(ana, 50, 0);
  const c = await kandidat("tata");
  assert.equal(await odbijZvukove([c], ANA, { ponovo: false }), 1);
});

test("greskeURed (izgovori i slike): naplaćuje broj vraćenih onome tko klikne", async () => {
  await limit(ana, 1, 1);
  await db().prepare("INSERT INTO zvuk_generiranja (kljuc, izgovor, zatrazio, status) VALUES ('a', 'A.', 'x', 'greska'), ('b', 'B.', 'x', 'greska')").run();
  await assert.rejects(greskeURed(ANA), odbijena);
  assert.equal(await broj("SELECT COUNT(*) AS n FROM zvuk_generiranja WHERE status = 'greska'"), 2);
  assert.equal(await greskeURed(SA), 2);
  assert.equal(poslano.length, 2);
  assert.equal(await potroseno((await platitelj(SA))!.korisnikId, "zvukovi"), 2);
  assert.equal(await greskeURed(ANA), 0);   // nema grešaka: nema ni naplate ni odbijanja

  const [r] = await rijeci(1);
  const s = await stil("bojanka");
  await db().prepare("INSERT INTO generiranja (rijec_id, stil_id, prompt, zatrazio, status) VALUES (?, ?, 'p', 'x', 'greska')").bind(r, s.id).run();
  assert.equal(await neuspjeleURed(ANA), 1);
  assert.equal(await potroseno(ana), 1);
});

test("odgovorNaKvotu: JSON za API i fetch, 303 natrag s ?kvota= za obrazac", async () => {
  const e = new KvotaPrekoracena({ vrsta: "slike", trazeno: 2, preostalo: 1, limit: 50, oslobadaSe: null, poruka: "Ostalo ti je 1 od 50 slika." });
  const zahtjev = (put: string, h: Record<string, string>) => {
    const url = new URL(`https://logomedo.com${put}`);
    return [new Request(url, { method: "POST", headers: h }), url] as const;
  };
  let r = odgovorNaKvotu(e, ...zahtjev("/api/v1/admin/slike/1/odluka", { "content-type": "application/json" }));
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { error: "kvota", poruka: e.poruka, greska: e.poruka, ok: false });
  r = odgovorNaKvotu(e, ...zahtjev("/admin/api/slika/1", { "content-type": "application/json" }));
  assert.equal(r.status, 429);
  r = odgovorNaKvotu(e, ...zahtjev("/admin/api/generiraj", {
    "content-type": "multipart/form-data; boundary=x", referer: "https://logomedo.com/admin/rijec/mama?stil=bojanka#slike",
  }));
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), `/admin/rijec/mama?stil=bojanka&kvota=${new URLSearchParams({ x: e.poruka }).toString().slice(2)}`);
  r = odgovorNaKvotu(e, ...zahtjev("/admin/situacije", { "content-type": "application/x-www-form-urlencoded", referer: "https://zlo.example/admin" }));
  assert.ok(r.headers.get("location")!.startsWith("/admin?kvota="));
});

test("aktivnost.vrati: posao vraćen u red se naplaćuje; bez kredita se ne vraća ništa", async () => {
  await limit(ana, 1);
  await dodajURed(await stil("bojanka"), await rijeci(1), ANA);
  const zapis = (await broj("SELECT id AS n FROM aktivnost WHERE radnja = 'generiranje.zatrazeno'"));
  assert.equal((await aktivnost.vrati(zapis, "ponisti", ANA, ANA)).ok, true);   // makni iz reda: nije AI posao
  assert.equal(await poslova(), 0);
  const zapisa = await broj("SELECT COUNT(*) AS n FROM aktivnost");
  await assert.rejects(aktivnost.vrati(zapis, "vrati", ANA, ANA), odbijena);
  assert.equal(await poslova(), 0);
  assert.equal(await broj("SELECT COUNT(*) AS n FROM aktivnost"), zapisa);
  await limit(ana, 2);
  assert.equal((await aktivnost.vrati(zapis, "vrati", ANA, ANA)).ok, true);
  assert.equal(await poslova(), 1);
  assert.equal(await potroseno(ana), 2);
});
