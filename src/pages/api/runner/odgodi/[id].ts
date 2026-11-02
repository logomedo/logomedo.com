import type { APIRoute } from "astro";
import { odgodi } from "../../../../lib/generiranje";

/** Runner: kvota ili privremena greška modela, posao natrag u red bez trošenja pokušaja. */
export const POST: APIRoute = async ({ request, params }) => {
  const b = await request.json<{ razlog?: string }>().catch(() => ({ razlog: undefined }));
  await odgodi(Number(params.id), b.razlog ?? "odgođeno");
  return Response.json({ ok: true });
};
