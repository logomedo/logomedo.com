import type { APIRoute } from "astro";
import { indeksRijeci } from "../../../lib/katalog";

/** Indeks riječi za tražilicu u bočnoj traci; filtrira se u pregledniku (~750 riječi, par KB). */
export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await indeksRijeci()), {
    headers: { "content-type": "application/json", "cache-control": "private, max-age=30" },
  });
