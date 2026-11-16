// rutaSamoSuperadmin: prefiksi administracije, normalizacija kao adminPutanja u middlewareu (docs/rbac/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { rutaSamoSuperadmin, SAMO_SUPERADMIN, smijeNa } from "./rute.ts";

test("svaka ruta, s podputanjom i kosom crtom na kraju", () => {
  for (const r of SAMO_SUPERADMIN) {
    assert.equal(rutaSamoSuperadmin(r), true, r);
    assert.equal(rutaSamoSuperadmin(`${r}/`), true, `${r}/`);
    assert.equal(rutaSamoSuperadmin(`${r}/nesto/dublje`), true, `${r}/nesto/dublje`);
  }
});

test("popis ruta je točno ovaj", () => {
  assert.deepEqual([...SAMO_SUPERADMIN].sort(), [
    "/admin/api/app-kod", "/admin/api/zvuk-proba", "/admin/app/prijava", "/admin/korisnici",
    "/admin/prompt", "/admin/red", "/admin/zvukovi/glasovi",
  ]);
});

test("kodirane kose crte (%2F i %2f)", () => {
  assert.equal(rutaSamoSuperadmin("/admin%2Fprompt"), true);
  assert.equal(rutaSamoSuperadmin("/admin%2fprompt"), true);
  assert.equal(rutaSamoSuperadmin("/admin/api%2Fzvuk-proba"), true);
  assert.equal(rutaSamoSuperadmin("/admin/zvukovi%2Fglasovi"), true);
  assert.equal(rutaSamoSuperadmin("%2Fadmin%2Fkorisnici"), true);
  assert.equal(rutaSamoSuperadmin("/admin/%72ed"), true);
});

test("dvostruke kose crte i velika slova", () => {
  assert.equal(rutaSamoSuperadmin("//admin//prompt"), true);
  assert.equal(rutaSamoSuperadmin("/admin///red/"), true);
  assert.equal(rutaSamoSuperadmin("/ADMIN/Prompt"), true);
  assert.equal(rutaSamoSuperadmin("/Admin/App/Prijava"), true);
  assert.equal(rutaSamoSuperadmin("/ADMIN%2FKORISNICI"), true);
});

test("neispravno kodiranje ne baca, sirova putanja se i dalje provjerava", () => {
  assert.equal(rutaSamoSuperadmin("/admin/prompt/%E0%A4%A"), true);
  assert.equal(rutaSamoSuperadmin("/admin/zadaci/%E0%A4%A"), false);
});

test("negativni slučajevi: susjedne i javne rute", () => {
  for (const p of [
    "/admin", "/admin/", "/admin/zvukovi", "/admin/zvukovi/", "/admin/redovi", "/admin/red-x", "/admin/promptovi",
    "/admin/korisnicix", "/admin/poziv", "/admin/poziv/options", "/admin/poziv/verify", "/admin/zadaci",
    "/admin/zadaci/1", "/admin/biljeznice", "/admin/aktivnost", "/admin/postavke", "/admin/passkeys",
    "/admin/api/zadatak/1", "/admin/api/zvuk", "/admin/app", "/admin/api/app", "/prompt", "/red", "/",
  ]) assert.equal(rutaSamoSuperadmin(p), false, p);
});

test("smijeNa: superadmin sve, logoped ne administraciju", () => {
  assert.equal(smijeNa("superadmin", "/admin/prompt"), true);
  assert.equal(smijeNa("logoped", "/admin/prompt"), false);
  assert.equal(smijeNa("logoped", "/admin/zadaci"), true);
});
