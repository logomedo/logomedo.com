// Varijante snimke glasa (migracija 0041, docs/zvukovi.md „Snimke glasova”): više odobrenih snimki po
// glasu, točno jedna primarna, igra pušta primarnu.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import { obrisiSnimkuGlasa, odobreniZvukovi, oznaciSnimku, postaviPrimarnuSnimku, snimkeGlasova, spremiSnimkuGlasa } from "./zvukovi.ts";

const SA = "a@primjer.hr";
const javno = new Set<string>();
const r2 = new Map<string, ArrayBuffer>();

beforeEach(() => {
  env.DB = napraviD1();
  env.ADMIN_EMAILS = SA;
  javno.clear(); r2.clear();
  env.JAVNO = { head: async (k: string) => (javno.has(k) ? {} : null), put: async (k: string) => { javno.add(k); }, delete: async (k: string) => { javno.delete(k); } };
  env.SLIKE = { put: async (k: string, b: ArrayBuffer) => { r2.set(k, b); }, get: async (k: string) => (r2.has(k) ? { body: r2.get(k) } : null) };
});

const wav = (n: number) => { const b = new Uint8Array(64); b[50] = n; return b.buffer; };
const primarne = async () => (await snimkeGlasova()).filter((s) => s.primarna).map((s) => s.id);

test("prva snimka je primarna, druga varijanta ne zamjenjuje prvu", async () => {
  const a = await spremiSnimkuGlasa("S", wav(1), SA);
  const b = await spremiSnimkuGlasa("S", wav(2), SA, "produljeno");
  const s = await snimkeGlasova();
  assert.deepEqual(s.map((x) => [x.id, x.primarna, x.oznaka]), [[a, true, null], [b, false, "produljeno"]]);
  assert.equal(javno.size, 2);
  const url = (await odobreniZvukovi(["/s/"]))["/s/"];
  assert.equal(url, s[0].url);
});

test("primarna se mijenja, igra pušta novu primarnu", async () => {
  const a = await spremiSnimkuGlasa("S", wav(1), SA);
  const b = await spremiSnimkuGlasa("S", wav(2), SA);
  assert.ok(await postaviPrimarnuSnimku(b));
  assert.deepEqual(await primarne(), [b]);
  const s = await snimkeGlasova();
  assert.equal((await odobreniZvukovi(["/s/"]))["/s/"], s.find((x) => x.id === b)!.url);
  // Nova snimka „neka bude primarna”.
  const c = await spremiSnimkuGlasa("S", wav(3), SA, null, true);
  assert.deepEqual(await primarne(), [c]);
  assert.ok(a);
});

test("brisanje primarne promovira najnoviju preostalu; zadnja brisanjem utiša glas", async () => {
  const a = await spremiSnimkuGlasa("Š", wav(1), SA);
  const b = await spremiSnimkuGlasa("Š", wav(2), SA);
  const c = await spremiSnimkuGlasa("Š", wav(3), SA);
  assert.ok(await obrisiSnimkuGlasa(a, SA));
  assert.deepEqual(await primarne(), [c]);
  assert.ok(await obrisiSnimkuGlasa(b, SA));   // nije primarna: primarna ostaje
  assert.deepEqual(await primarne(), [c]);
  assert.ok(await obrisiSnimkuGlasa(c, SA));
  assert.deepEqual(await snimkeGlasova(), []);
  assert.deepEqual(await odobreniZvukovi(["/š/"]), {});
  assert.equal(javno.size, 0);
  assert.equal(await obrisiSnimkuGlasa(c, SA), false);
});

test("oznaka i glasovi su neovisni", async () => {
  const s = await spremiSnimkuGlasa("S", wav(1), SA);
  const z = await spremiSnimkuGlasa("Z", wav(2), SA);
  assert.ok(await oznaciSnimku(z, "zvučno"));
  assert.deepEqual(await primarne(), [s, z]);
  assert.equal((await snimkeGlasova()).find((x) => x.id === z)!.oznaka, "zvučno");
});
