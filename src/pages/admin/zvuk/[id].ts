import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

/** Snimka iz privatnog R2 (kandidati i odbijeni nisu javni). Ključ je hash sadržaja. */
export const GET: APIRoute = async ({ params }) => {
  const z = await env.DB.prepare("SELECT r2_kljuc, mime FROM zvukovi WHERE id = ?").bind(Number(params.id)).first<{ r2_kljuc: string; mime: string }>();
  const o = z && (await env.SLIKE.get(z.r2_kljuc));
  if (!o) return new Response("Nema snimke", { status: 404 });
  return new Response(o.body, { headers: { "content-type": z.mime, "cache-control": "private, max-age=31536000, immutable" } });
};
