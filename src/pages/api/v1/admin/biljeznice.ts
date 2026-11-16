import type { APIRoute } from "astro";
import { admin, greska } from "../../../../lib/app/api";
import { popis } from "../../../../lib/biljeznice";

/** Sve bilježnice (i nejavne), zadnje mijenjane prve. */
export const GET: APIRoute = async (ctx) => {
  if (!admin(ctx)) return greska("forbidden", 403);
  // Aplikacija (uloga admin na /api/v1) vidi sve; e-mail autora ne ide van.
  const b = await popis(null);
  return Response.json(b.map(({ stil: _stil, autor: _autor, ...x }) => ({ ...x, javna: x.javna === 1 })));
};
