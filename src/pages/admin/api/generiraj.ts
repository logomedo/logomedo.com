import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { stil } from "../../../lib/katalog";
import { dodajURed } from "../../../lib/generiranje";
import { safeNext } from "../../../lib/admin/sesija";

/**
 * Dodaje poslove u red: `rijec` (jedna ili više) ili `glas` (+ `pozicija`) za sve
 * riječi tog glasa koje još nemaju odobrenu ni kandidata.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const f = await request.formData();
  const s = await stil(String(f.get("stil") || "bojanka"));
  let ids = f.getAll("rijec").map(Number).filter(Boolean);
  const glas = String(f.get("glas") ?? "");
  if (!ids.length && glas) {
    const pozicija = String(f.get("pozicija") ?? "");
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT rg.rijec_id AS id FROM rijec_glas rg JOIN glasovi g ON g.id = rg.glas_id JOIN rijeci r ON r.id = rg.rijec_id
       WHERE g.slug = ? AND (? = '' OR rg.pozicija = ?) AND r.aktivna = 1
         AND NOT EXISTS (SELECT 1 FROM slike x WHERE x.rijec_id = rg.rijec_id AND x.stil_id = ? AND x.status IN ('odobrena','kandidat'))
       ORDER BY r.legacy_koristeno DESC`,
    ).bind(glas, pozicija, pozicija, s.id).all<{ id: number }>();
    ids = results.map((r) => r.id);
  }
  const n = await dodajURed(s, ids, locals.admin!.email, String(f.get("napomena") ?? "") || undefined);
  const next = new URL(safeNext(String(f.get("next") ?? "")), "http://x");
  next.searchParams.set("dodano", String(n));
  return new Response(null, { status: 303, headers: { location: next.pathname + next.search } });
};
