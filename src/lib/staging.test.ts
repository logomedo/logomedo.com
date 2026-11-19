import { test } from "node:test";
import assert from "node:assert/strict";
import { stagingVrata } from "./staging.ts";

const H = "https://staging.logomedo.com";
const zahtjev = (put: string, auth?: string) =>
  new Request(H + put, auth ? { headers: { authorization: auth } } : {});
const ok = async () => new Response("unutra", { status: 200, headers: { "content-type": "text/plain" } });
const STAGING = { OKRUZENJE: "staging" };

test("produkcija (bez OKRUZENJE): odgovor je točno onaj iz dalje(), bez noindexa", async () => {
  const izvorni = new Response("x", { status: 200 });
  for (const env of [{}, { OKRUZENJE: "" }, { OKRUZENJE: "production" }]) {
    const r = await stagingVrata(zahtjev("/"), env, async () => izvorni);
    assert.equal(r, izvorni);
    assert.equal(r.headers.get("x-robots-tag"), null);
  }
});

test("staging: javne putanje bez lozinke, dalje() jednom, noindex, zaglavlja sačuvana", async () => {
  for (const put of ["/", "/favicon.svg", "/katalog", "/b/abc", "/_astro/x.js", "/admin/login"]) {
    let pozivi = 0;
    const r = await stagingVrata(zahtjev(put), STAGING, async () => { pozivi++; return ok(); });
    assert.equal(r.status, 200, put);
    assert.equal(pozivi, 1);
    assert.equal(await r.text(), "unutra");
    assert.equal(r.headers.get("x-robots-tag"), "noindex");
    assert.equal(r.headers.get("content-type"), "text/plain");
    assert.equal(r.headers.get("www-authenticate"), null);
  }
});

test("staging: odgovor zaštite (/admin 302, /api 401) prolazi nepromijenjen, uz noindex", async () => {
  const preusmjeri = async () => new Response(null, { status: 302, headers: { location: "/admin/login?next=%2Fadmin" } });
  const r = await stagingVrata(zahtjev("/admin", "Basic eDp5"), STAGING, preusmjeri);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "/admin/login?next=%2Fadmin");
  assert.equal(r.headers.get("x-robots-tag"), "noindex");
  const api = await stagingVrata(zahtjev("/api/v1/ja"), STAGING, async () => new Response("api", { status: 401 }));
  assert.equal(api.status, 401);
  assert.equal(await api.text(), "api");
  assert.equal(api.headers.get("x-robots-tag"), "noindex");
});

test("staging: odgovor 101 (WebSocket) prolazi netaknut", async () => {
  const ws = { status: 101, headers: new Headers() } as unknown as Response;
  const r = await stagingVrata(zahtjev("/api/runner/zvono"), STAGING, async () => ws);
  assert.equal(r, ws);
});
