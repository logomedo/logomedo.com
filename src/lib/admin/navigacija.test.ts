// Bočne trake admina (docs/uprava/plan.md): Uprava je samo superadmin, svaka poveznica vodi na stvarnu stranicu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { TRAKE, stavkeTrake, type Traka } from "./navigacija.ts";
import { rutaSamoSuperadmin, smijeNa } from "./rute.ts";

const stranica = (href: string) => {
  const baza = new URL(`../../pages${href}`, import.meta.url).pathname;
  return [`${baza}.astro`, `${baza}/index.astro`].some(existsSync);
};

test("svaka stavka obje trake vodi na postojeću stranicu", () => {
  for (const t of Object.values(TRAKE)) for (const s of stavkeTrake(t)) assert.ok(stranica(s.href), s.href);
});

test("skupine Uprave su sve pod /admin/uprava, dakle samo superadmin", () => {
  for (const s of (TRAKE.uprava as Traka).skupine.flatMap((g) => g.stavke)) {
    assert.ok(s.href.startsWith("/admin/uprava/"), s.href);
    assert.equal(rutaSamoSuperadmin(s.href), true, s.href);
  }
});

test("logoped u Sadržaju vidi skupine i postavke, ali ne gumb Uprava", () => {
  const vidi = stavkeTrake(TRAKE.sadrzaj).filter((s) => smijeNa("logoped", s.href)).map((s) => s.kod);
  for (const k of ["pregled", "zvukovi", "katalog", "predlosci", "zadaci", "biljeznice", "aktivnost", "postavke"]) assert.ok(vidi.includes(k), k);
  for (const k of ["uprava", "red", "prompt"]) assert.ok(!vidi.includes(k), k);
});

test("kodovi stavki su jedinstveni unutar trake", () => {
  for (const t of Object.values(TRAKE)) {
    const kodovi = stavkeTrake(t).map((s) => s.kod);
    assert.equal(new Set(kodovi).size, kodovi.length);
  }
});
