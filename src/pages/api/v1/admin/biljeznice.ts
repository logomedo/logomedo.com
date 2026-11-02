import type { APIRoute } from "astro";
import { admin, greska } from "../../../../lib/app/api";
import { popis } from "../../../../lib/biljeznice";

/** Sve bilježnice (i nejavne), zadnje mijenjane prve. */
export const GET: APIRoute = async (ctx) => {
  if (!admin(ctx)) return greska("forbidden", 403);
  const b = await popis();
  return Response.json(b.map(({ stil: _stil, ...x }) => ({ ...x, javna: x.javna === 1 })));
};
