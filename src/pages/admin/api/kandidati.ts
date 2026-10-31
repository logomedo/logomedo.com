import type { APIRoute } from "astro";
import { kandidati, nedavneOdluke } from "../../../lib/pregled";

/** Osvježavanje pregleda: trenutni kandidati i nedavne odluke (svaki preglednik pita svake 3 s). */
export const GET: APIRoute = async ({ url }) => {
  const [k, o] = await Promise.all([kandidati(url.searchParams.get("glas")), nedavneOdluke()]);
  return Response.json({ kandidati: k, odluke: o }, { headers: { "cache-control": "no-store" } });
};
