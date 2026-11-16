import type { APIRoute } from "astro";
import { popis } from "../../../../lib/aktivnost";
import { aktivnostFiltar } from "../../../../lib/admin/vlasnistvo";

const broj = (v: string | null) => (v && Number(v) > 0 ? Number(v) : undefined);

/**
 * Dnevnik aktivnosti, najnovije prvo. `nakon`: samo novije (osvježavanje uživo svakih 5 s), `prije`: starija stranica.
 * Logoped vidi samo svoje zapise bez administracije; njegov `tko` se ne gleda (odluka 9).
 */
export const GET: APIRoute = async ({ url, locals }) => {
  const q = url.searchParams;
  const stavke = await popis({
    nakon: broj(q.get("nakon")), prije: broj(q.get("prije")), rijecId: broj(q.get("rijec")),
    tko: q.get("tko") || undefined, limit: broj(q.get("limit")),
  }, aktivnostFiltar(locals.admin!));
  return Response.json({ stavke }, { headers: { "cache-control": "no-store" } });
};
