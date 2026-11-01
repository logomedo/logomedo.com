import type { APIRoute } from "astro";
import { admin, greska } from "../../../../../lib/app/api";
import { glas, rijeciGlasa, stilIzUrla } from "../../../../../lib/katalog";

/** Riječi jednog glasa s pozicijom i stanjem slike u odabranom stilu. */
export const GET: APIRoute = async (ctx) => {
  if (!admin(ctx)) return greska("forbidden", 403);
  const g = await glas(String(ctx.params.slug));
  if (!g) return greska("not_found", 404);
  const s = await stilIzUrla(ctx.url);
  return Response.json({ stil: s.kod, glas: g, rijeci: await rijeciGlasa(g.id, s.id) });
};
