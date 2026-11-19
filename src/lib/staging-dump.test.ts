import { test } from "node:test";
import assert from "node:assert/strict";
import { naredbe, nuliraj, rastavi, redoslijed, samoreference, slozi, straniKljucevi, viseciKljucevi, type Tablica } from "./staging-dump.ts";

const T: Tablica[] = [
  { name: "stilovi", sql: "CREATE TABLE stilovi (\n  id INTEGER PRIMARY KEY,\n  naziv TEXT\n, verzija INTEGER REFERENCES prompt_verzije(id))" },
  { name: "slike", sql: "CREATE TABLE slike (\n  id INTEGER PRIMARY KEY,\n  stil_id INTEGER NOT NULL REFERENCES stilovi(id),\n  opis TEXT\n, x TEXT, zamjenjuje INTEGER REFERENCES slike(id))" },
  { name: "prompt_verzije", sql: "CREATE TABLE prompt_verzije (\n  id INTEGER PRIMARY KEY,\n  tekst TEXT\n)" },
  { name: "aktivnost", sql: 'CREATE TABLE "aktivnost" (\n  id INTEGER PRIMARY KEY,\n  vraca_id INTEGER REFERENCES aktivnost_nova(id),\n  rijec_id INTEGER GENERATED ALWAYS AS (json_extract(p, \'$.a,b\')) VIRTUAL\n)' },
];

test("redoslijed: roditelj prije djeteta", () => {
  const r = redoslijed(T);
  assert.ok(r.indexOf("prompt_verzije") < r.indexOf("stilovi"));
  assert.ok(r.indexOf("stilovi") < r.indexOf("slike"));
  assert.equal(r.length, 4);
});

test("strani ključevi, i oni dodani ALTER TABLE-om u istom retku", () => {
  assert.deepEqual(straniKljucevi(T[1]), [{ stupac: "stil_id", roditelj: "stilovi" }, { stupac: "zamjenjuje", roditelj: "slike" }]);
  assert.deepEqual([...viseciKljucevi(T)], [["aktivnost", ["vraca_id"]]]);
  assert.deepEqual([...samoreference(T)], [["slike", ["zamjenjuje"]]]);
});

test("rastavi poštuje navodnike, '' i zagrade", () => {
  assert.deepEqual(rastavi("1,'a,b','it''s',NULL,(1,2)"), ["1", "'a,b'", "'it''s'", "NULL", "(1,2)"]);
});

test("nuliraj mijenja samo zadani stupac i pamti staru vrijednost", () => {
  const x = nuliraj(`INSERT INTO "slike" ("id","stil_id","opis","zamjenjuje") VALUES(5,1,'a, b',3);`, ["zamjenjuje"]);
  assert.equal(x.naredba, `INSERT INTO "slike" ("id","stil_id","opis","zamjenjuje") VALUES(5,1,'a, b',NULL);`);
  assert.equal(x.stare.get("zamjenjuje"), "3");
  assert.equal(x.id, "5");
  assert.equal(nuliraj(`INSERT INTO "slike" ("id","zamjenjuje") VALUES(1,NULL);`, ["zamjenjuje"]).promijenjeno, false);
});

test("naredbe: višeredni string ostaje u istoj naredbi", () => {
  const n = naredbe(`PRAGMA defer_foreign_keys=TRUE;\nINSERT INTO "a" ("t") VALUES('x\nINSERT INTO');\nINSERT INTO "b" ("t") VALUES(1);`);
  assert.equal(n.length, 3);
  assert.equal(n[1].tablica, "a");
  assert.match(n[1].tekst, /x\nINSERT INTO'\);$/);
});

test("slozi: roditelji prvi, viseći ključ NULL, samoreferenca UPDATE-om na kraju", () => {
  const dump = [
    "PRAGMA defer_foreign_keys=TRUE;",
    `INSERT INTO "stilovi" ("id","naziv","verzija") VALUES(1,'s',7);`,
    `INSERT INTO "slike" ("id","stil_id","opis","x","zamjenjuje") VALUES(1,1,'o',NULL,2);`,
    `INSERT INTO "slike" ("id","stil_id","opis","x","zamjenjuje") VALUES(2,1,'o',NULL,NULL);`,
    `INSERT INTO "prompt_verzije" ("id","tekst") VALUES(7,'p');`,
    `INSERT INTO "aktivnost" ("id","vraca_id") VALUES(1,NULL);`,
    `INSERT INTO "aktivnost" ("id","vraca_id") VALUES(2,1);`,
  ].join("\n");
  const x = slozi(dump, T);
  const reci = x.dump.split("\n");
  assert.equal(reci[0], "PRAGMA defer_foreign_keys=TRUE;");
  const gdje = (s: string) => reci.findIndex((l) => l.includes(s));
  assert.ok(gdje(`"prompt_verzije"`) < gdje(`"stilovi"`));
  assert.ok(gdje(`"stilovi"`) < gdje(`"slike" ("id","stil_id","opis","x","zamjenjuje") VALUES(1`));
  assert.ok(reci.includes(`INSERT INTO "slike" ("id","stil_id","opis","x","zamjenjuje") VALUES(1,1,'o',NULL,NULL);`));
  assert.ok(reci.includes(`INSERT INTO "aktivnost" ("id","vraca_id") VALUES(2,NULL);`));
  assert.equal(reci.at(-1), `UPDATE "slike" SET "zamjenjuje" = 2 WHERE "id" = 1;`);
  assert.deepEqual([...x.nulirano], [["aktivnost", 1]]);
  assert.equal(reci.length, 8);
});

test("staging-dump: d1_migrations staginga se ne prazni i ne puni iz produkcije", () => {
  const tablice = [{ name: "d1_migrations", sql: "CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT)" }, { name: "a", sql: "CREATE TABLE a (id INTEGER PRIMARY KEY)" }];
  const dump = [`INSERT INTO "d1_migrations" ("id","name") VALUES(1,'0001.sql');`, `INSERT INTO "a" ("id") VALUES(1);`].join("\n");
  const x = slozi(dump, tablice);
  assert.doesNotMatch(x.dump, /d1_migrations/);
  assert.match(x.dump, /INSERT INTO "a"/);
});

test("staging-dump: strani ključ odmah iza komentara se prepozna", () => {
  const t = { name: "z", sql: "CREATE TABLE z (\n  id INTEGER PRIMARY KEY,\n  a TEXT, -- napomena, s zarezom\n  roditelj_id INTEGER REFERENCES z(id) /* x, y */\n)" };
  assert.deepEqual(straniKljucevi(t), [{ stupac: "roditelj_id", roditelj: "z" }]);
});
