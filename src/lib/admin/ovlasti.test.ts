// Matrica ovlasti i pravilo za ulogu (docs/rbac/, odluka 2). Čisti TS, bez baze.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OVLASTI, odrediUlogu, smije, type Ovlast, type Uloga } from "./ovlasti.ts";

/** Očekivano, napisano ručno: logoped smije samo katalog, zadatke i AI (kroz kvotu). */
const OCEKIVANO: Record<Ovlast, Record<Uloga, boolean>> = {
  katalog: { superadmin: true, logoped: true },
  "katalog.uredivanje": { superadmin: true, logoped: false },
  zadaci: { superadmin: true, logoped: true },
  ai: { superadmin: true, logoped: true },
  "ai.bez_limita": { superadmin: true, logoped: false },
  "sve.zadaci": { superadmin: true, logoped: false },
  "aktivnost.tudja": { superadmin: true, logoped: false },
  korisnici: { superadmin: true, logoped: false },
  administracija: { superadmin: true, logoped: false },
};
const ULOGE: Uloga[] = ["superadmin", "logoped"];

test("OVLASTI ima točno očekivane ključeve (nova ovlast ne prolazi nezapažena)", () => {
  assert.deepEqual(Object.keys(OVLASTI).sort(), Object.keys(OCEKIVANO).sort());
  for (const o of Object.keys(OVLASTI) as Ovlast[]) assert.deepEqual(Object.keys(OVLASTI[o]).sort(), [...ULOGE].sort(), o);
});

test("smije: cijela matrica", () => {
  for (const o of Object.keys(OCEKIVANO) as Ovlast[]) {
    for (const u of ULOGE) assert.equal(smije(u, o), OCEKIVANO[o][u], `${u} / ${o}`);
  }
});

test("smije: logoped točno katalog, zadaci, ai; superadmin sve", () => {
  const sve = Object.keys(OVLASTI) as Ovlast[];
  assert.deepEqual(sve.filter((o) => smije("logoped", o)).sort(), ["ai", "katalog", "zadaci"]);
  assert.deepEqual(sve.filter((o) => smije("superadmin", o)), sve);
});

test("smije: nepoznata ovlast ili uloga je false, ne iznimka", () => {
  assert.equal(smije("superadmin", "nepostojeca" as Ovlast), false);
  assert.equal(smije("gost" as Uloga, "katalog"), false);
});

const ADMINI = new Set(["sa@primjer.hr"]);

test("odrediUlogu: superadmin ne gleda redak", () => {
  assert.equal(odrediUlogu("sa@primjer.hr", ADMINI, null), "superadmin");
  assert.equal(odrediUlogu("sa@primjer.hr", ADMINI, { uloga: "admin", aktivan: 0 }), "superadmin");
  assert.equal(odrediUlogu("sa@primjer.hr", ADMINI, { uloga: "logoped", aktivan: 1 }), "superadmin");
  assert.equal(odrediUlogu("sa@primjer.hr", ADMINI, { uloga: "logoped", aktivan: 0 }), "superadmin");
});

test("odrediUlogu: velika slova i razmaci u e-mailu", () => {
  assert.equal(odrediUlogu("  SA@Primjer.HR ", ADMINI, null), "superadmin");
});

test("odrediUlogu: logoped samo s aktivnim retkom 'logoped'", () => {
  assert.equal(odrediUlogu("logoped@primjer.hr", ADMINI, { uloga: "logoped", aktivan: 1 }), "logoped");
  assert.equal(odrediUlogu("logoped@primjer.hr", ADMINI, { uloga: "logoped", aktivan: 0 }), null);
});

test("odrediUlogu: redak 'admin' izvan ADMIN_EMAILS i nepoznat e-mail nemaju pristup", () => {
  assert.equal(odrediUlogu("bivsi@primjer.hr", ADMINI, { uloga: "admin", aktivan: 1 }), null);
  assert.equal(odrediUlogu("nepoznat@primjer.hr", ADMINI, null), null);
  assert.equal(odrediUlogu("nepoznat@primjer.hr", new Set(), null), null);
});
