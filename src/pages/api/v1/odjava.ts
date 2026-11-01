import type { APIRoute } from "astro";
import { odjavi } from "../../../lib/app/sesija";

export const POST: APIRoute = async ({ request }) => {
  await odjavi(request);
  return new Response(null, { status: 204 });
};
