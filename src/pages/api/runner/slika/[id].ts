import type { APIRoute } from "astro";
import { MAX_BAJTOVA, predaj } from "../../../../lib/generiranje";

/** Tijelo je sama slika (Content-Type image/png|jpeg|webp); `X-Model` je model koji ju je stvarno nacrtao. */
export const PUT: APIRoute = async ({ request, params }) => {
  const duljina = Number(request.headers.get("content-length") ?? 0);
  if (duljina > MAX_BAJTOVA) return Response.json({ error: "prevelika slika" }, { status: 413 });
  const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  const r = await predaj(Number(params.id), mime, await request.arrayBuffer(), request.headers.get("x-model"));
  return "greska" in r ? Response.json({ error: r.greska }, { status: 400 }) : Response.json(r);
};
