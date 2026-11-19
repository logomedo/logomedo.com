import { test } from "node:test";
import assert from "node:assert/strict";
import { izuzeto, jednako, lozinkaIzZaglavlja, stagingVrata } from "./staging.ts";

const H = "https://staging.logomedo.com";
const basic = (korisnik: string, lozinka: string) => "Basic " + btoa(`${korisnik}:${lozinka}`);
const zahtjev = (put: string, auth?: string) =>
  new Request(H + put, auth ? { headers: { authorization: auth } } : {});
const ok = async () => new Response("unutra", { status: 200, headers: { "content-type": "text/plain" } });
const STAGING = { OKRUZENJE: "staging", STAGING_LOZINKA: "tajna-za-test" };

test("produkcija (bez OKRUZENJE): odgovor je točno onaj iz dalje(), bez noindexa", async () => {
  const izvorni = new Response("x", { status: 200 });
  for (const env of [{}, { STAGING_LOZINKA: "nesto" }, { OKRUZENJE: "" }, { OKRUZENJE: "production" }]) {
    const r = await stagingVrata(zahtjev("/"), env, async () => izvorni);
    assert.equal(r, izvorni);
    assert.equal(r.headers.get("x-robots-tag"), null);
  }
});

test("produkcija: ne gleda Authorization i ne zove dalje() više puta", async () => {
  let pozivi = 0;
  const r = await stagingVrata(zahtjev("/admin", "Basic !!!"), {}, async () => { pozivi++; return ok(); });
  assert.equal(r.status, 200);
  assert.equal(pozivi, 1);
});

test("staging bez lozinke: 401 s WWW-Authenticate i noindex, dalje() se ne zove", async () => {
  for (const put of ["/", "/favicon.svg", "/admin", "/admin/login", "/b/abc", "/_astro/x.js", "/api/v2/x"]) {
    let pozvan = false;
    const r = await stagingVrata(zahtjev(put), STAGING, async () => { pozvan = true; return ok(); });
    assert.equal(r.status, 401, put);
    assert.match(r.headers.get("www-authenticate") ?? "", /^Basic realm=/);
    assert.equal(r.headers.get("x-robots-tag"), "noindex");
    assert.equal(pozvan, false);
  }
});

test("staging s krivom lozinkom ili lošim zaglavljem: 401", async () => {
  for (const auth of [basic("a", "kriva"), basic("a", ""), "Bearer tajna-za-test", "Basic ###", "Basic " + btoa("bezdvotocke")]) {
    const r = await stagingVrata(zahtjev("/", auth), STAGING, ok);
    assert.equal(r.status, 401, auth);
  }
});

test("staging s točnom lozinkom: 200, bilo koji korisnik, noindex", async () => {
  for (const korisnik of ["", "logoped", "netko:s:dvotockom"]) {
    const r = await stagingVrata(zahtjev("/", basic(korisnik.split(":")[0], "tajna-za-test")), STAGING, ok);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "unutra");
    assert.equal(r.headers.get("x-robots-tag"), "noindex");
    assert.equal(r.headers.get("content-type"), "text/plain");
  }
});

test("staging: lozinka smije sadržavati dvotočku i UTF-8", async () => {
  const env = { OKRUZENJE: "staging", STAGING_LOZINKA: "a:b:čćž" };
  const auth = "Basic " + Buffer.from("x:a:b:čćž", "utf8").toString("base64");
  assert.equal((await stagingVrata(zahtjev("/", auth), env, ok)).status, 200);
});

test("staging bez secreta: 503 i za točno zaglavlje, nikad otvoreno", async () => {
  for (const env of [{ OKRUZENJE: "staging" }, { OKRUZENJE: "staging", STAGING_LOZINKA: "" }]) {
    const r = await stagingVrata(zahtjev("/", basic("a", "")), env, ok);
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("x-robots-tag"), "noindex");
  }
});

test("staging: /api/v1 i /api/runner/* prolaze bez lozinke (vlastita provjera), s noindexom", async () => {
  for (const put of ["/api/v1", "/api/v1/", "/api/v1/katalog", "/api/runner/zvono", "/api/runner/posao"]) {
    const r = await stagingVrata(zahtjev(put), STAGING, async () => new Response("api", { status: 401 }));
    assert.equal(r.status, 401, put);
    assert.equal(await r.text(), "api");
    assert.equal(r.headers.get("www-authenticate"), null);
    assert.equal(r.headers.get("x-robots-tag"), "noindex");
  }
});

test("izuzeci se ne mogu iskoristiti za druge putanje", () => {
  for (const put of ["/api/v10", "/api/v1x", "/api/runner", "/api/v1/..%2Fadmin", "/api/v1/%2e%2e/admin",
    "/api/v1//admin", "/api/runner/%ZZ", "/admin/api/v1", "/API/V1"]) {
    assert.equal(izuzeto(put), false, put);
  }
  // URL parser sam razrješava ../ prije provjere.
  assert.equal(new URL(H + "/api/v1/../../admin").pathname, "/admin");
});

test("staging: odgovor 101 (WebSocket) prolazi netaknut", async () => {
  const ws = { status: 101, headers: new Headers() } as unknown as Response;
  const r = await stagingVrata(zahtjev("/api/runner/zvono"), STAGING, async () => ws);
  assert.equal(r, ws);
});

test("lozinkaIzZaglavlja i jednako", async () => {
  assert.equal(lozinkaIzZaglavlja(null), null);
  assert.equal(lozinkaIzZaglavlja(basic("u", "p")), "p");
  assert.equal(lozinkaIzZaglavlja("basic " + btoa("u:p")), "p");
  assert.equal(await jednako("abc", "abc"), true);
  assert.equal(await jednako("abc", "abd"), false);
  assert.equal(await jednako("abc", "abcd"), false);
});
