// Istoznačnice (migracija 0042): grupe riječi istog značenja; generator iz grupe uzima jednu.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { napraviD1 } from "./test/d1.ts";
import { env } from "./test/cloudflare-workers.ts";
import { jednaPoGrupi } from "./istoznacnice-cisto.ts";
import { istoznacniceRijeci, odvezi, povezi } from "./istoznacnice.ts";
import { slozi, type RijecZadatka } from "./zadaci/vrste.ts";

const r = (id: number, grupa: number | null, slika: string | null = "x") => ({ id, grupa, slika });

test("jednaPoGrupi: iz grupe ostaje jedna, riječi bez grupe sve", () => {
  const out = jednaPoGrupi([r(1, 1), r(2, 1), r(3, null), r(4, 4), r(5, 4), r(6, 4), r(7, null)]);
  assert.equal(out.filter((x) => x.grupa === 1).length, 1);
  assert.equal(out.filter((x) => x.grupa === 4).length, 1);
  assert.deepEqual(out.filter((x) => x.grupa === null).map((x) => x.id), [3, 7]);
});

test("jednaPoGrupi: prednost ima riječ s traženim glasom, pa sa slikom", () => {
  assert.deepEqual(jednaPoGrupi([r(1, 1), r(2, 1)], () => 0.5, (x) => x.id === 2).map((x) => x.id), [2]);
  assert.deepEqual(jednaPoGrupi([r(1, 1, null), r(2, 1)], () => 0.9).map((x) => x.id), [2]);
});

test("jednaPoGrupi: bez grupa ne troši slučajne brojeve (postojeći testovi s rnd ostaju isti)", () => {
  let n = 0;
  jednaPoGrupi([r(1, null), r(2, null)], () => (n++, 0));
  assert.equal(n, 0);
});

const ids = (x: unknown, out: number[] = []): number[] => {
  if (Array.isArray(x)) x.forEach((y) => ids(y, out));
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) { if (k === "rijec_id" && typeof v === "number") out.push(v); else ids(v, out); }
  return out;
};

test("slozi nikad ne stavi dvije riječi iz iste grupe", () => {
  const rijeci: RijecZadatka[] = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1, rijec: `rijec${i}`, rima: null, slogova: 2, slika: "s", grupa: i < 4 ? 100 : i < 6 ? 200 : null,
  }));
  for (let k = 0; k < 30; k++) {
    const u = [...new Set(ids(slozi("percepcija", rijeci, { stavki: 6 })))];
    assert.ok(u.length >= 5);
    assert.ok(u.filter((id) => id <= 4).length <= 1);
    assert.ok(u.filter((id) => id === 5 || id === 6).length <= 1);
  }
});

beforeEach(() => { env.DB = napraviD1(); });
const db = () => env.DB as D1Database;
const nova = async (rijec: string) =>
  (await db().prepare("INSERT INTO rijeci (rijec, slug) VALUES (?, ?) RETURNING id").bind(`t-${rijec}`, `t-${rijec}`).first<{ id: number }>())!.id;
const imena = async (id: number) => (await istoznacniceRijeci(id)).map((x) => x.rijec.slice(2));

test("poveži, spoji grupe, odveži (grupa s jednom riječi nestaje)", async () => {
  const [krevet, postelja, lezaj, auto, automobil] = [await nova("krevet"), await nova("postelja"), await nova("ležaj"), await nova("auto"), await nova("automobil")];
  await povezi(krevet, postelja, "a@b.hr");
  assert.deepEqual(await imena(krevet), ["postelja"]);
  await povezi(lezaj, krevet, "a@b.hr");
  assert.deepEqual(await imena(postelja), ["krevet", "ležaj"]);
  await povezi(auto, automobil, "a@b.hr");
  await povezi(auto, lezaj, "a@b.hr");
  assert.deepEqual(await imena(automobil), ["auto", "krevet", "ležaj", "postelja"]);
  await odvezi(auto); await odvezi(automobil);
  assert.deepEqual(await imena(krevet), ["ležaj", "postelja"]);
  await odvezi(krevet); await odvezi(lezaj);
  const n = await db().prepare("SELECT count(*) AS n FROM istoznacnice").first<number>("n");
  assert.equal(n, 0);
});
