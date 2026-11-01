import type { APIRoute } from "astro";
import { admin, greska } from "../../../../lib/app/api";
import { indeksRijeci } from "../../../../lib/katalog";

/** Indeks svih aktivnih riječi za tražilicu (filtrira se na uređaju). r = riječ, s = slug, o = ima odobrenu, k = kandidata. */
export const GET: APIRoute = async (ctx) => {
  if (!admin(ctx)) return greska("forbidden", 403);
  return Response.json(await indeksRijeci(), { headers: { "cache-control": "private, max-age=30" } });
};
