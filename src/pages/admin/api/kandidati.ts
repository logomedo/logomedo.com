import type { APIRoute } from "astro";
import { kandidati, nedavneOdluke } from "../../../lib/pregled";
import { pregledFiltar } from "../../../lib/admin/vlasnistvo";

/** Osvježavanje pregleda: trenutni kandidati i nedavne odluke (svaki preglednik pita svake 3 s). */
export const GET: APIRoute = async ({ url, locals }) => {
  const vidi = pregledFiltar(locals.admin!, url.searchParams.get("korisnik"));
  const logoped = locals.admin!.uloga !== "superadmin";
  const [k, o] = await Promise.all([kandidati(url.searchParams.get("glas"), vidi, logoped), nedavneOdluke(vidi, logoped)]);
  return Response.json({ kandidati: k, odluke: o }, { headers: { "cache-control": "no-store" } });
};
