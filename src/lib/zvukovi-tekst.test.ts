import { test } from "node:test";
import assert from "node:assert/strict";
import { izgovorZa, kljucZvuka, prolazi, slicnost } from "./zvukovi-tekst.ts";

test("ključ ne ovisi o velikim slovima i razmacima", () => {
  assert.equal(kljucZvuka("  Što se rimuje s riječi  ČAJ? "), "što se rimuje s riječi čaj?");
  assert.equal(kljucZvuka("ČAJ"), kljucZvuka("čaj"));
});

test("izgovor: veliko prvo slovo i točka", () => {
  assert.equal(izgovorZa("jaslice"), "Jaslice.");
  assert.equal(izgovorZa("što se rimuje s riječi čaj?"), "Što se rimuje s riječi čaj?");
  assert.equal(izgovorZa("bravo! sve lampice svijetle."), "Bravo! Sve lampice svijetle.");
});

test("riječ mora biti prepisana točno, s dijakriticima", () => {
  assert.ok(prolazi("jaslice", "Jaslice."));
  assert.ok(!prolazi("jaslice", "Jazzlis"));
  assert.ok(!prolazi("čaj", "caj"));
});

test("rečenica smije imati sitnu razliku prijepisa", () => {
  assert.ok(prolazi("Koja se riječ ne rimuje s ostalima?", "Koja se riječ ne rimuje sa ostalima"));
  assert.ok(!prolazi("Poveži riječi koje se rimuju.", "Pove riči ko se ri"));
  assert.equal(slicnost("a b", "A, b!"), 1);
});

test("načini: riječ prvo multilingual s kontekstom, rečenica glavni model", async () => {
  const { naciniZa, opisNacina, razloziNacin } = await import("./zvukovi-tekst.ts");
  assert.deepEqual(naciniZa("led", "eleven_v4"), ["eleven_multilingual_v2+kontekst", "eleven_multilingual_v2+rez", "eleven_v4"]);
  assert.deepEqual(naciniZa("Pronađi sve slike koje počinju glasom Č.", "eleven_v4"), ["eleven_v4", "eleven_v4", "eleven_multilingual_v2"]);
  assert.deepEqual(razloziNacin("eleven_v4"), { model: "eleven_v4", dodatak: "" });
  assert.equal(opisNacina("eleven_multilingual_v2+rez"), "multilingual v2, izrezano iz rečenice");
});

test("ćirilica u prijepisu se preslovi", () => {
  assert.equal(prolazi("dim", "дим?"), true);
  assert.equal(prolazi("bal", "Бал"), true);
  assert.equal(prolazi("konj", "Конь"), true);
  assert.equal(prolazi("njuška", "Нюшка?"), true);
  assert.equal(prolazi("sir", "Сэр"), false);
  assert.equal(prolazi("ćup", "Чуп"), false);
});
