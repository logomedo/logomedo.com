// Svix potpis: službeni vektori (docs/inbox/research/2026-11-19-resend-primanje.md §1), pogrešan potpis,
// star i budući žig, više potpisa u zaglavlju, nedostajuća zaglavlja i ključ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { potpisi, provjeriPotpis, TOLERANCIJA_S } from "./svix.ts";

// docs.svix.com/receiving/verifying-payloads/how-manual (i resend.com/docs/dashboard/webhooks/verify-webhooks-requests)
const M = {
  tajna: "whsec_plJ3nmyCDGBKInavdOK15jsl",
  id: "msg_loFOjxBNrRLzqYUf",
  vrijeme: "1731705121",
  tijelo: '{"event_type":"ping","data":{"success":true}}',
  potpis: "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=",
};
// github.com/svix/svix-webhooks javascript/src/webhook.test.ts, „sign function works”
const J = {
  tajna: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  vrijeme: "1614265330",
  tijelo: '{"test": 2432232314}',
  potpis: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};

const zag = (v: typeof M, potpis = v.potpis) => ({ "svix-id": v.id, "svix-timestamp": v.vrijeme, "svix-signature": potpis });
const uVrijeme = (v: typeof M, pomak = 0) => (Number(v.vrijeme) + pomak) * 1000;

test("službeni vektori: potpisi() daje točan potpis", async () => {
  assert.equal(await potpisi(M.tajna, M.id, M.vrijeme, M.tijelo), M.potpis);
  assert.equal(await potpisi(J.tajna, J.id, J.vrijeme, J.tijelo), J.potpis);
});

test("službeni vektori prolaze provjeru (i s Headers, i ključ bez whsec_)", async () => {
  assert.deepEqual(await provjeriPotpis(M.tajna, zag(M), M.tijelo, uVrijeme(M)), { ok: true, id: M.id });
  assert.deepEqual(await provjeriPotpis(J.tajna, new Headers(zag(J)), J.tijelo, uVrijeme(J, 30)), { ok: true, id: J.id });
  assert.equal((await provjeriPotpis(J.tajna.slice(6), zag(J), J.tijelo, uVrijeme(J))).ok, true);
});

test("pogrešan potpis, promijenjeno tijelo, tuđi ključ", async () => {
  const krivi = "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  assert.deepEqual(await provjeriPotpis(M.tajna, zag(M, krivi), M.tijelo, uVrijeme(M)), { ok: false, razlog: "potpis" });
  assert.deepEqual(await provjeriPotpis(M.tajna, zag(M), M.tijelo + " ", uVrijeme(M)), { ok: false, razlog: "potpis" });
  assert.deepEqual(await provjeriPotpis(J.tajna, zag(M), M.tijelo, uVrijeme(M)), { ok: false, razlog: "potpis" });
  assert.deepEqual(await provjeriPotpis(M.tajna, zag(M, "v2," + M.potpis.slice(3)), M.tijelo, uVrijeme(M)), { ok: false, razlog: "potpis" });
  assert.deepEqual(await provjeriPotpis(M.tajna, zag(M, "v1,ne-base64!"), M.tijelo, uVrijeme(M)), { ok: false, razlog: "potpis" });
});

test("star i budući žig izvan tolerancije", async () => {
  assert.equal((await provjeriPotpis(M.tajna, zag(M), M.tijelo, uVrijeme(M, TOLERANCIJA_S))).ok, true);
  assert.deepEqual(await provjeriPotpis(M.tajna, zag(M), M.tijelo, uVrijeme(M, TOLERANCIJA_S + 1)), { ok: false, razlog: "vrijeme" });
  assert.deepEqual(await provjeriPotpis(M.tajna, zag(M), M.tijelo, uVrijeme(M, -TOLERANCIJA_S - 1)), { ok: false, razlog: "vrijeme" });
  // Zadano `sada` je sat: službeni vektor iz 2024. je star.
  assert.deepEqual(await provjeriPotpis(M.tajna, zag(M), M.tijelo), { ok: false, razlog: "vrijeme" });
});

test("više potpisa u zaglavlju: dovoljan je jedan ispravan v1", async () => {
  const vise = `v2,abc v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ${M.potpis} v1,xyz`;
  assert.equal((await provjeriPotpis(M.tajna, zag(M, vise), M.tijelo, uVrijeme(M))).ok, true);
});

test("nedostaje tajna ili zaglavlje", async () => {
  assert.deepEqual(await provjeriPotpis(undefined, zag(M), M.tijelo, uVrijeme(M)), { ok: false, razlog: "tajna" });
  assert.deepEqual(await provjeriPotpis("whsec_", zag(M), M.tijelo, uVrijeme(M)), { ok: false, razlog: "tajna" });
  for (const ime of ["svix-id", "svix-timestamp", "svix-signature"] as const) {
    const z: Record<string, string> = zag(M);
    delete z[ime];
    assert.deepEqual(await provjeriPotpis(M.tajna, z, M.tijelo, uVrijeme(M)), { ok: false, razlog: "zaglavlja" }, ime);
  }
  assert.deepEqual(await provjeriPotpis(M.tajna, { ...zag(M), "svix-timestamp": "12a" }, M.tijelo, uVrijeme(M)), { ok: false, razlog: "zaglavlja" });
});
