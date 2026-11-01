import type { APIRoute } from "astro";
import { uzmi } from "../../../lib/generiranje";

/** Runner uzima sljedeći posao; 204 kad je red prazan. */
export const POST: APIRoute = async () => {
  const p = await uzmi();
  return p ? Response.json(p) : new Response(null, { status: 204 });
};
