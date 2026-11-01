import type { APIRoute } from "astro";
import { popis } from "../../../../lib/aktivnost";

const broj = (v: string | null) => (v && Number(v) > 0 ? Number(v) : undefined);

/** Dnevnik aktivnosti, najnovije prvo. `nakon`: samo novije (osvježavanje uživo svakih 5 s), `prije`: starija stranica. */
export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams;
  const stavke = await popis({
    nakon: broj(q.get("nakon")), prije: broj(q.get("prije")), rijecId: broj(q.get("rijec")),
    tko: q.get("tko") || undefined, limit: broj(q.get("limit")),
  });
  return Response.json({ stavke }, { headers: { "cache-control": "no-store" } });
};
