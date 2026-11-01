import type { APIRoute } from "astro";
import { neuspjeh } from "../../../../lib/generiranje";

export const POST: APIRoute = async ({ request, params }) => {
  const b = await request.json<{ greska?: string }>().catch(() => ({ greska: undefined }));
  await neuspjeh(Number(params.id), b.greska || "nepoznata greška");
  return Response.json({ ok: true });
};
