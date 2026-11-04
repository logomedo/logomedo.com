import type { APIRoute } from "astro";
import { MAX_BAJTOVA } from "../../../../lib/generiranje";
import { neuspjehPozadine, odgodiPozadinu, predajPozadinu } from "../../../../lib/pozadine-generiranje";

/** Runner, posao situacije: PUT = slika (Content-Type image/*, `X-Model`). */
export const PUT: APIRoute = async ({ request, params }) => {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BAJTOVA) return Response.json({ error: "prevelika slika" }, { status: 413 });
  const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  const r = await predajPozadinu(Number(params.id), mime, await request.arrayBuffer(), request.headers.get("x-model"));
  return "greska" in r ? Response.json({ error: r.greska }, { status: 400 }) : Response.json(r);
};

/** POST `{greska}` = neuspjeh, `{razlog}` = odgodi (kvota, token), kao /api/runner/greska i /odgodi. */
export const POST: APIRoute = async ({ request, params }) => {
  const b = await request.json<{ greska?: string; razlog?: string }>().catch(() => ({} as { greska?: string; razlog?: string }));
  if (b.razlog !== undefined) await odgodiPozadinu(Number(params.id), b.razlog);
  else await neuspjehPozadine(Number(params.id), b.greska || "nepoznata greška");
  return Response.json({ ok: true });
};
