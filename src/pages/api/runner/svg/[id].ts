import type { APIRoute } from "astro";
import { MAX_SVG_BAJTOVA, predajSvg } from "../../../../lib/generiranje";

/** SVG verzija slike :id (slike.id, ne posao). Tijelo je SVG iz scripts/svg.sh. */
export const PUT: APIRoute = async ({ request, params }) => {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_SVG_BAJTOVA) return Response.json({ error: "prevelik SVG" }, { status: 413 });
  const r = await predajSvg(Number(params.id), await request.arrayBuffer());
  return "greska" in r ? Response.json({ error: r.greska }, { status: 400 }) : Response.json(r);
};
