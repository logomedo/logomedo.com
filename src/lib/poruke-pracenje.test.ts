// Potpis za praćenje novih poruka (odluka 313): mijenja se s novom porukom, za nit samo s porukom tog razgovora.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { env } from "./test/cloudflare-workers.ts";
import { napraviD1 } from "./test/d1.ts";
import { adresaZaOdgovor, noviRazgovor, potpisPoruka, spremiDolaznu } from "./poruke.ts";

beforeEach(() => { env.DB = napraviD1(); });

async function dolazna(kljuc: string, resendId: string) {
  await spremiDolaznu({
    resendId, messageId: `<${resendId}@primjer.test>`, inReplyTo: null, reference: [], od: "Ana <ana@primjer.test>",
    za: [adresaZaOdgovor(kljuc)], predmet: "Re: x", text: "bok", html: null, tijeloFali: false, privitci: [], createdAt: "2026-11-19T12:00:00.000Z",
  });
}

test("potpis se mijenja s novom dolaznom porukom; nit samo sa svojom", async () => {
  const a = await noviRazgovor({ email: "ana@primjer.test", ime: "Ana", predmet: "x" });
  const b = await noviRazgovor({ email: "iva@primjer.test", ime: "Iva", predmet: "y" });
  const [popis0, nitA0] = [await potpisPoruka(), await potpisPoruka(a.id)];
  assert.equal(nitA0, "0");
  await dolazna(b.kljuc, "em_b1");
  assert.notEqual(await potpisPoruka(), popis0);
  assert.equal(await potpisPoruka(a.id), nitA0);
  await dolazna(a.kljuc, "em_a1");
  assert.notEqual(await potpisPoruka(a.id), nitA0);
});
