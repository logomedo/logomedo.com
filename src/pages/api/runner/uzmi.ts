import type { APIRoute } from "astro";
import { uzmi } from "../../../lib/generiranje";
import { uzmiPozadinu } from "../../../lib/pozadine-generiranje";

/** Runner uzima sljedeći posao (prvo situacije, `vrsta: "pozadina"`); 204 kad je red prazan. */
export const POST: APIRoute = async () => {
  const p = (await uzmiPozadinu()) ?? (await uzmi());
  return p ? Response.json(p) : new Response(null, { status: 204 });
};
