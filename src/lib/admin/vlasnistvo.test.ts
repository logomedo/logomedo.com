// Vlasništvo (docs/rbac/, odluke 8 i 9): logoped vidi i mijenja samo svoje zadatke, bilježnice i
// zapise aktivnosti; superadmin sve. Nad pravom shemom (napraviD1, sve migracije).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "../test/d1.ts";
import { env } from "../test/cloudflare-workers.ts";
import { aktivnostFiltar, autorFiltar } from "./vlasnistvo.ts";
import * as zadaci from "../zadaci/baza.ts";
import * as biljeznice from "../biljeznice.ts";
import * as aktivnost from "../aktivnost.ts";

const SA = "a@primjer.hr";
const ANA = "ana@primjer.hr";
const BORIS = "boris@primjer.hr";

const db = () => env.DB as D1Database;
let ana = 0;
let boris = 0;
let saId = 0;

const logoped = (email: string) =>
  db().prepare("INSERT INTO korisnici (email, uloga) VALUES (?, 'logoped') RETURNING id").bind(email).first<number>("id") as Promise<number>;
const noviZadatak = (autor: number, naslov: string) =>
  zadaci.stvori(autor, "odabir", null, naslov, "", { odnos: "rima", stavke: [] } as never);
const izmjena = (naslov: string) => ({ naslov, uputa: "", podrucje_id: null, stil: "", sadrzaj: { odnos: "rima", stavke: [] } });
const naslovZadatka = (id: number) => db().prepare("SELECT naslov FROM zadaci WHERE id = ?").bind(id).first<string>("naslov");
const obrisan = async (id: number) => (await db().prepare("SELECT obrisan_at FROM zadaci WHERE id = ?").bind(id).first<string | null>("obrisan_at")) !== null;
const sadrzajBiljeznice = async (id: number) =>
  (await db().prepare("SELECT zadatak_id FROM biljeznica_zadaci WHERE biljeznica_id = ? ORDER BY redoslijed").bind(id).all<{ zadatak_id: number }>())
    .results.map((r) => r.zadatak_id);
const polja = (naslov: string, zadaci: number[]) => ({ naslov, podnaslov: "", slug: "", javna: true, tema: "bozic" as const, zadaci });

beforeEach(async () => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
  ana = await logoped(ANA);
  boris = await logoped(BORIS);
  saId = await zadaci.korisnikId(SA);
});

// ---- autorFiltar / aktivnostFiltar ----

test("autorFiltar: superadmin null (i bez retka), logoped svoj id, logoped bez retka baca", () => {
  assert.equal(autorFiltar({ uloga: "superadmin", korisnikId: null }), null);
  assert.equal(autorFiltar({ uloga: "superadmin", korisnikId: 7 }), null);
  assert.equal(autorFiltar({ uloga: "logoped", korisnikId: 7 }), 7);
  assert.throws(() => autorFiltar({ uloga: "logoped", korisnikId: null }));
});

test("aktivnostFiltar: superadmin null, logoped svoj e-mail", () => {
  assert.equal(aktivnostFiltar({ uloga: "superadmin", email: SA }), null);
  assert.equal(aktivnostFiltar({ uloga: "logoped", email: ANA }), ANA);
});

// ---- Zadaci ----

test("popis: logoped vidi samo svoje, superadmin sve s autorom", async () => {
  const a = await noviZadatak(ana, "Anin");
  const b = await noviZadatak(boris, "Borisov");
  const s = await noviZadatak(saId, "Superadminov");
  assert.deepEqual((await zadaci.popis(ana)).map((z) => z.id), [a]);
  assert.deepEqual((await zadaci.popis(boris)).map((z) => z.id), [b]);
  const svi = await zadaci.popis(null);
  assert.deepEqual(svi.map((z) => z.id).sort(), [a, b, s].sort());
  assert.equal(svi.find((z) => z.id === b)?.autor, BORIS);
});

test("zadatak(): tuđi je null, svoj i superadminu vidljiv", async () => {
  const b = await noviZadatak(boris, "Borisov");
  assert.equal(await zadaci.zadatak(b, ana), null);
  assert.equal((await zadaci.zadatak(b, boris))?.naslov, "Borisov");
  assert.equal((await zadaci.zadatak(b, null))?.naslov, "Borisov");
});

test("spremi(): tuđi vraća null i ništa ne mijenja; svoj i superadmin spremaju", async () => {
  const b = await noviZadatak(boris, "Borisov");
  assert.equal(await zadaci.spremi(b, izmjena("Ana je bila tu"), ana), null);
  assert.equal(await naslovZadatka(b), "Borisov");
  assert.equal(await zadaci.spremi(b, izmjena("Boris mijenja"), boris), 1);
  assert.equal(await naslovZadatka(b), "Boris mijenja");
  assert.equal(await zadaci.spremi(b, izmjena("Superadmin mijenja"), null), 1);
  assert.equal(await naslovZadatka(b), "Superadmin mijenja");
});

test("obrisi()/vrati(): tuđi bez učinka (false), svoj radi", async () => {
  const b = await noviZadatak(boris, "Borisov");
  assert.equal(await zadaci.obrisi(b, ana), false);
  assert.equal(await obrisan(b), false);
  assert.equal(await zadaci.obrisi(b, boris), true);
  assert.equal(await obrisan(b), true);
  assert.deepEqual(await zadaci.obrisani(ana), []);
  assert.deepEqual((await zadaci.obrisani(boris)).map((z) => z.id), [b]);
  assert.deepEqual((await zadaci.obrisani(null)).map((z) => z.id), [b]);
  assert.equal(await zadaci.vrati(b, ana), false);
  assert.equal(await obrisan(b), true);
  assert.equal(await zadaci.vrati(b, boris), true);
  assert.equal(await obrisan(b), false);
});

test("obrisi(): ponovno brisanje zadržava prvo vrijeme i vraća true", async () => {
  const a = await noviZadatak(ana, "Anin");
  await db().prepare("UPDATE zadaci SET obrisan_at = '2026-01-01 00:00:00' WHERE id = ?").bind(a).run();
  assert.equal(await zadaci.obrisi(a, ana), true);
  assert.equal(await db().prepare("SELECT obrisan_at FROM zadaci WHERE id = ?").bind(a).first<string>("obrisan_at"), "2026-01-01 00:00:00");
});

test("obrisiVise(): logoped briše samo svoje, superadmin sve", async () => {
  const a = await noviZadatak(ana, "Anin");
  const b = await noviZadatak(boris, "Borisov");
  assert.equal(await zadaci.obrisiVise([a, b], ana), 1);
  assert.equal(await obrisan(a), true);
  assert.equal(await obrisan(b), false);
  assert.equal(await zadaci.obrisiVise([b], null), 1);
  assert.equal(await obrisan(b), true);
});

// ---- Bilježnice ----

test("bilježnice: popis i poId filtrirani po autoru", async () => {
  const ba = await biljeznice.nova(ANA, { naslov: "Anina", podnaslov: "", slug: "", tema: "bozic" });
  const bb = await biljeznice.nova(BORIS, { naslov: "Borisova", podnaslov: "", slug: "", tema: "bozic" });
  assert.deepEqual((await biljeznice.popis(ana)).map((b) => b.id), [ba]);
  const sve = await biljeznice.popis(null);
  assert.deepEqual(sve.map((b) => b.id).sort(), [ba, bb].sort());
  assert.equal(sve.find((b) => b.id === bb)?.autor, BORIS);
  assert.equal(await biljeznice.poId(bb, ana), null);
  assert.equal((await biljeznice.poId(bb, boris))?.naslov, "Borisova");
  assert.equal((await biljeznice.poId(bb, null))?.naslov, "Borisova");
});

test("bilježnica: brisanje samo svoje; zadaci ostaju", async () => {
  const za = await noviZadatak(ana, "Anin za brisanje");
  const ba = await biljeznice.nova(ANA, { naslov: "Anina brisanje", podnaslov: "", slug: "", tema: "bozic" });
  const bb = await biljeznice.nova(BORIS, { naslov: "Borisova brisanje", podnaslov: "", slug: "", tema: "bozic" });
  await biljeznice.spremi(ba, ANA, polja("Anina brisanje", [za]), ana);
  await biljeznice.obrisi(bb, ANA, ana);
  assert.equal((await biljeznice.poId(bb, null))?.naslov, "Borisova brisanje");
  await biljeznice.obrisi(ba, ANA, ana);
  assert.equal(await biljeznice.poId(ba, null), null);
  assert.deepEqual(await sadrzajBiljeznice(ba), []);
  assert.ok((await zadaci.popis(ana)).some((z) => z.id === za));
});

test("bilježnica: logoped ne može staviti tuđi zadatak; svoj ide", async () => {
  const za = await noviZadatak(ana, "Anin");
  const zb = await noviZadatak(boris, "Borisov");
  const ba = await biljeznice.nova(ANA, { naslov: "Anina", podnaslov: "", slug: "", tema: "bozic" });
  await biljeznice.spremi(ba, ANA, polja("Anina", [zb, za, 9999]), ana);
  assert.deepEqual(await sadrzajBiljeznice(ba), [za]);
});

test("bilježnica: tuđi zadatak koji je već unutra (stavio ga superadmin) ostaje pri logopedovu spremanju", async () => {
  const za = await noviZadatak(ana, "Anin");
  const zs = await noviZadatak(saId, "Superadminov");
  const ba = await biljeznice.nova(ANA, { naslov: "Anina", podnaslov: "", slug: "", tema: "bozic" });
  await biljeznice.spremi(ba, SA, polja("Anina", [zs]), null);
  assert.deepEqual(await sadrzajBiljeznice(ba), [zs]);
  await biljeznice.spremi(ba, ANA, polja("Anina", [za, zs]), ana);
  assert.deepEqual(await sadrzajBiljeznice(ba), [za, zs]);
  // Kad ga logoped makne, ne može ga vratiti.
  await biljeznice.spremi(ba, ANA, polja("Anina", [za]), ana);
  await biljeznice.spremi(ba, ANA, polja("Anina", [za, zs]), ana);
  assert.deepEqual(await sadrzajBiljeznice(ba), [za]);
});

test("bilježnica: logoped ne mijenja tuđu (ni naslov ni zadatke), superadmin smije sve", async () => {
  const za = await noviZadatak(ana, "Anin");
  const zb = await noviZadatak(boris, "Borisov");
  const bb = await biljeznice.nova(BORIS, { naslov: "Borisova", podnaslov: "", slug: "", tema: "bozic" });
  await biljeznice.spremi(bb, BORIS, polja("Borisova", [zb]), boris);
  await biljeznice.spremi(bb, ANA, polja("Preoteta", [za]), ana);
  assert.equal((await biljeznice.poId(bb, null))?.naslov, "Borisova");
  assert.deepEqual(await sadrzajBiljeznice(bb), [zb]);
  await biljeznice.spremi(bb, SA, polja("Superadmin", [za, zb]), null);
  assert.equal((await biljeznice.poId(bb, null))?.naslov, "Superadmin");
  assert.deepEqual(await sadrzajBiljeznice(bb), [za, zb]);
});

// ---- Aktivnost ----

const zapis = (tko: string, tablica: string, grupa: string, redak = 1) =>
  db().prepare("INSERT INTO aktivnost (tko, radnja, tablica, grupa, redak_id, prije, poslije) VALUES (?, 'test', ?, ?, ?, NULL, '{}') RETURNING id")
    .bind(tko, tablica, grupa, redak).first<number>("id") as Promise<number>;

test("aktivnost popis: logoped samo svoje, bez korisnika i pozivnica; `tko` iz URL-a se ne gleda", async () => {
  const anin = await zapis(ANA, "rijeci", "g1");
  await zapis(BORIS, "rijeci", "g2");
  await zapis(ANA, "korisnici", "g3");
  await zapis(ANA, "pozivi", "g3");
  await zapis(SA, "biljeznice", "g4");
  assert.deepEqual((await aktivnost.popis({}, ANA)).map((s) => s.id), [anin]);
  assert.deepEqual((await aktivnost.popis({ tko: BORIS }, ANA)).map((s) => s.id), [anin]);
  assert.equal((await aktivnost.popis({}, null)).length, 5);
  assert.equal((await aktivnost.popis({ tko: BORIS }, null)).length, 1);
  assert.deepEqual(await aktivnost.autori(ANA), [ANA]);
  assert.deepEqual(await aktivnost.autori(null), [ANA, SA, BORIS].sort());
});

test("aktivnost vrati: tuđi ili administracijski zapis je zabranjen prije ikakve izmjene", async () => {
  const bb = await biljeznice.nova(BORIS, { naslov: "Borisova", podnaslov: "", slug: "", tema: "bozic" });
  await biljeznice.spremi(bb, BORIS, polja("Borisova 2", []), boris);
  const borisov = (await aktivnost.popis({}, BORIS))[0].id;
  const prije = await db().prepare("SELECT COUNT(*) AS n FROM aktivnost").first<number>("n");
  for (const smjer of ["ponisti", "vrati"] as const) {
    const r = await aktivnost.vrati(borisov, smjer, ANA, ANA);
    assert.deepEqual(r, { ok: false, greska: "Nemaš pristup tom zapisu.", zabranjeno: true });
  }
  assert.equal(await db().prepare("SELECT COUNT(*) AS n FROM aktivnost").first<number>("n"), prije);
  assert.equal((await biljeznice.poId(bb, null))?.naslov, "Borisova 2");

  const admin = await zapis(ANA, "korisnici", "g9");
  assert.equal((await aktivnost.vrati(admin, "ponisti", ANA, ANA) as { zabranjeno?: true }).zabranjeno, true);
  // Grupa koja miješa svoj zapis i administraciju: zabranjeno.
  const mjesovit = await zapis(ANA, "rijeci", "g9");
  assert.equal((await aktivnost.vrati(mjesovit, "ponisti", ANA, ANA) as { zabranjeno?: true }).zabranjeno, true);
});

test("aktivnost vrati: svoj zapis logoped smije poništiti; superadmin tuđi", async () => {
  const ba = await biljeznice.nova(ANA, { naslov: "Anina", podnaslov: "", slug: "", tema: "bozic" });
  await biljeznice.spremi(ba, ANA, polja("Anina 2", []), ana);
  const anin = (await aktivnost.popis({}, ANA))[0].id;
  const r = await aktivnost.vrati(anin, "ponisti", ANA, ANA);
  assert.equal(r.ok, true);
  assert.equal((await biljeznice.poId(ba, null))?.naslov, "Anina");
  const r2 = await aktivnost.vrati(anin, "vrati", SA, null);
  assert.equal(r2.ok, true);
  assert.equal((await biljeznice.poId(ba, null))?.naslov, "Anina 2");
});

test("aktivnost vrati: nepostojeći zapis i dalje 'Nema tog zapisa.' (ne zabranjeno)", async () => {
  assert.deepEqual(await aktivnost.vrati(12345, "ponisti", ANA, ANA), { ok: false, greska: "Nema tog zapisa." });
});
