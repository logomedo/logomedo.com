// Javne (odobrene) slike na istom originu, za PDF koji se slaže u pregledniku: cdn.logomedo.com
// nema CORS, a CSP stranice dopušta fetch samo na 'self'. Javni bucket drži samo odobrene
// slike, a ključ sadrži hash sadržaja, pa se smije keširati zauvijek.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ params }) => {
  const kljuc = String(params.kljuc ?? "");
  if (!kljuc || kljuc.includes("..")) return new Response("Nema", { status: 404 });
  const o = await env.JAVNO.get(kljuc);
  if (!o) return new Response("Nema", { status: 404 });
  const h = new Headers();
  h.set("content-type", o.httpMetadata?.contentType ?? "application/octet-stream");
  h.set("cache-control", "public, max-age=31536000, immutable");
  h.set("x-content-type-options", "nosniff");
  h.set("etag", o.httpEtag);
  return new Response(o.body, { headers: h });
};
