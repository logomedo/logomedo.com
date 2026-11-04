import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { izgovori, prepisi, GreskaElevenLabs } from "../../../lib/elevenlabs";
import { postavka } from "../../../lib/postavke";
import { slicnost } from "../../../lib/zvukovi-tekst";

/**
 * Proba glasa na /admin/zvukovi: mp3 i STT prijepis (zaglavlja x-prijepis, x-slicnost).
 * Spremljena u R2 (proba/<hash>.mp3) po glasu, modelu i tekstu, pa ponovno slušanje ne košta.
 */
export const GET: APIRoute = async ({ url }) => {
  const glas = url.searchParams.get("glas")?.trim() || (await postavka("zvuk_glas")).trim();
  const model = url.searchParams.get("model")?.trim() || (await postavka("zvuk_model")).trim() || "eleven_v3";
  const tekst = (url.searchParams.get("tekst") ?? "").trim().slice(0, 200);
  if (!/^[A-Za-z0-9]{10,40}$/.test(glas) || !tekst) return new Response("treba glas i tekst", { status: 400 });
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${glas}|${model}|${tekst}`)));
  const kljuc = `proba/${[...h.slice(0, 10)].map((x) => x.toString(16).padStart(2, "0")).join("")}.mp3`;
  const odgovor = (tijelo: ReadableStream | ArrayBuffer, prijepis: string) => new Response(tijelo, {
    headers: {
      "content-type": "audio/mpeg", "cache-control": "private, max-age=86400",
      "x-prijepis": encodeURIComponent(prijepis), "x-slicnost": prijepis ? slicnost(tekst, prijepis).toFixed(3) : "",
    },
  });
  const o = await env.SLIKE.get(kljuc);
  if (o) return odgovor(o.body, o.customMetadata?.prijepis ?? "");
  try {
    const mp3 = await izgovori(tekst, glas, model);
    const prijepis = await prepisi(mp3).catch(() => "");
    await env.SLIKE.put(kljuc, mp3, { httpMetadata: { contentType: "audio/mpeg" }, customMetadata: { prijepis, glas, model } });
    return odgovor(mp3, prijepis);
  } catch (e) {
    return new Response(String(e instanceof Error ? e.message : e), { status: e instanceof GreskaElevenLabs ? 502 : 500 });
  }
};
