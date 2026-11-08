import type { APIRoute } from "astro";
import { MAX_BAJTOVA, predajVarijantu } from "../../../../lib/generiranje";

/**
 * Kvadratna varijanta odobrene slike `id` (scripts/kvadrat.py). Tijelo je sama slika, `X-Nacin` kako je
 * nastala: `izrez`, `dopuna` ili ime modela. Ulazi kao kandidat u /admin/pregled.
 */
export const PUT: APIRoute = async ({ request, params }) => {
  const duljina = Number(request.headers.get("content-length") ?? 0);
  if (duljina > MAX_BAJTOVA) return Response.json({ error: "prevelika slika" }, { status: 413 });
  const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  const r = await predajVarijantu(Number(params.id), mime, await request.arrayBuffer(), request.headers.get("x-nacin") ?? "");
  return "greska" in r ? Response.json({ error: r.greska }, { status: 400 }) : Response.json(r);
};
