import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { admin, greska } from "../../../../../lib/app/api";

/** Datoteka slike iz privatnog R2 (i kandidati). Ključ sadrži hash sadržaja: smije se keširati zauvijek. */
export const GET: APIRoute = async (ctx) => {
  if (!admin(ctx)) return greska("forbidden", 403);
  const s = await env.DB.prepare("SELECT r2_kljuc, mime FROM slike WHERE id = ?").bind(Number(ctx.params.id)).first<{ r2_kljuc: string; mime: string }>();
  const o = s && (await env.SLIKE.get(s.r2_kljuc));
  if (!o) return greska("not_found", 404);
  return new Response(o.body, { headers: { "content-type": s.mime, "cache-control": "private, max-age=31536000, immutable" } });
};
