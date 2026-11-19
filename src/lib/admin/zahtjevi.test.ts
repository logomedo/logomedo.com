// Zahtjevi za pristup u adminu (S7 landinga): odobravanje izdaje pozivnicu (izdaj), dvostruki klik ne izdaje
// drugu, PozivOdbijen ne mijenja status, odbijanje i brojač. Svježa D1 po testu.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "../test/d1.ts";
import { env } from "../test/cloudflare-workers.ts";
import { sha256Hex } from "./sesija.ts";
import { ispravanToken, provjeri } from "./pozivi.ts";
import { brojNovih, noviZahtjevi, obradjeniZahtjevi, odbij, odobri } from "./zahtjevi.ts";
import { pocisti } from "../pristup.ts";

const SA = "sa@primjer.test";
const SADA = new Date("2026-11-19T12:00:00.000Z");

beforeEach(() => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
});

const db = () => env.DB as D1Database;
async function zahtjev(email: string, ime = "Ana Anić", created = "2026-11-18T10:00:00.000Z"): Promise<number> {
  return (await db().prepare(
    "INSERT INTO zahtjevi_pristupa (ime, email, ustanova, grad, privola_at, created_at) VALUES (?, ?, 'Vrtić', 'Zagreb', ?, ?) RETURNING id",
  ).bind(ime, email, created, created).first<number>("id"))!;
}
const red = (id: number) => db().prepare("SELECT status, obradio, obradjen_at, poziv_token_hash FROM zahtjevi_pristupa WHERE id = ?").bind(id).first();
const brojPoziva = async () => (await db().prepare("SELECT count(*) AS n FROM pozivi").first<number>("n"))!;

test("odobri: izdaje pozivnicu za e-mail i ime zahtjeva, status odobren, poziv_token_hash = sha-256 tokena", async () => {
  const id = await zahtjev("ana@primjer.test");
  const r = await odobri(id, SA, SADA);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(ispravanToken(r.token));
  assert.equal(r.email, "ana@primjer.test");
  assert.deepEqual({ ...(await red(id)) }, {
    status: "odobren", obradio: SA, obradjen_at: SADA.toISOString(), poziv_token_hash: await sha256Hex(r.token),
  });
  const p = await provjeri(r.token, SADA);
  assert.equal(p?.email, "ana@primjer.test");
  assert.equal(p?.ime, "Ana Anić");
  const z = (await db().prepare("SELECT tko, radnja, tablica FROM aktivnost").all()).results;
  assert.deepEqual(z, [{ tko: SA, radnja: "poziv.izdan", tablica: "pozivi" }]);
});

test("odobri dvaput (dvostruki klik, i istodobno): samo jedna pozivnica, drugi dobije „obradjen”", async () => {
  const id = await zahtjev("ana@primjer.test");
  assert.equal((await odobri(id, SA, SADA)).ok, true);
  assert.deepEqual(await odobri(id, SA, SADA), { ok: false, razlog: "obradjen" });
  assert.equal(await brojPoziva(), 1);
  const id2 = await zahtjev("bea@primjer.test");
  const oba = await Promise.all([odobri(id2, SA, SADA), odobri(id2, SA, SADA)]);
  assert.equal(oba.filter((x) => x.ok).length, 1);
  assert.equal(await brojPoziva(), 2);
});

test("odobri: PozivOdbijen (aktivan logoped, superadmin) → razlog, status ostaje novi, nema pozivnice", async () => {
  await db().prepare("INSERT INTO korisnici (email, uloga, aktivan) VALUES ('aktivan@primjer.test', 'logoped', 1)").run();
  const id = await zahtjev("aktivan@primjer.test");
  assert.deepEqual(await odobri(id, SA, SADA), { ok: false, razlog: "aktivan_logoped" });
  assert.deepEqual({ ...(await red(id)) }, { status: "novi", obradio: null, obradjen_at: null, poziv_token_hash: null });
  const id2 = await zahtjev(SA);
  assert.deepEqual(await odobri(id2, SA, SADA), { ok: false, razlog: "superadmin" });
  assert.equal((await red(id2))!.status, "novi");
  assert.equal(await brojPoziva(), 0);
  assert.equal(await odbij(id, SA, SADA), true, "takav zahtjev se zatvara odbijanjem");
});

test("odbij: status odbijen s obradio/obradjen_at; drugi put false; odbijen se ne može odobriti", async () => {
  const id = await zahtjev("ana@primjer.test");
  assert.equal(await odbij(id, SA, SADA), true);
  assert.deepEqual({ ...(await red(id)) }, { status: "odbijen", obradio: SA, obradjen_at: SADA.toISOString(), poziv_token_hash: null });
  assert.equal(await odbij(id, SA, SADA), false);
  assert.deepEqual(await odobri(id, SA, SADA), { ok: false, razlog: "obradjen" });
  assert.equal(await odbij(9999, SA, SADA), false);
  assert.equal(await brojPoziva(), 0);
});

test("popisi i brojač: novi po vremenu slanja, obrađeni od najnovijeg", async () => {
  const a = await zahtjev("a@primjer.test", "A", "2026-11-18T09:00:00.000Z");
  const b = await zahtjev("b@primjer.test", "B", "2026-11-18T08:00:00.000Z");
  const c = await zahtjev("c@primjer.test", "C", "2026-11-18T10:00:00.000Z");
  assert.equal(await brojNovih(), 3);
  assert.deepEqual((await noviZahtjevi()).map((z) => z.ime), ["B", "A", "C"]);
  await odbij(b, SA, new Date("2026-11-19T10:00:00.000Z"));
  await odobri(a, SA, new Date("2026-11-19T11:00:00.000Z"));
  assert.equal(await brojNovih(), 1);
  assert.deepEqual((await noviZahtjevi()).map((z) => z.id), [c]);
  assert.deepEqual((await obradjeniZahtjevi()).map((z) => [z.ime, z.status]), [["A", "odobren"], ["B", "odbijen"]]);
});

test("retencija: odobreni zahtjev nestaje kad je njegova pozivnica iskorištena", async () => {
  const id = await zahtjev("ana@primjer.test");
  const r = await odobri(id, SA, SADA);
  assert.ok(r.ok);
  await pocisti(SADA);
  assert.ok(await red(id), "pozivnica još nije iskorištena");
  await db().prepare("UPDATE pozivi SET iskoristena_at = ?").bind(SADA.toISOString()).run();
  await pocisti(SADA);
  assert.equal(await red(id), null);
});
