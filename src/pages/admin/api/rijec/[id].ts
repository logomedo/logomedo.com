import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { safeNext } from "../../../../lib/admin/sesija";

/** Opis za sliku i primjer rečenice; potvrda izvedene pozicije. */
export const POST: APIRoute = async ({ request, params }) => {
  const f = await request.formData();
  const id = Number(params.id);
  const t = (k: string) => { const v = String(f.get(k) ?? "").trim(); return v ? v.slice(0, 300) : null; };
  if (f.get("akcija") === "potvrdi") {
    await env.DB.prepare(
      "UPDATE rijec_glas SET potvrdeno = 1 WHERE rijec_id = ? AND pozicija = ? AND glas_id = (SELECT id FROM glasovi WHERE slug = ?)",
    ).bind(id, String(f.get("pozicija")), String(f.get("glas"))).run();
  } else if (f.get("akcija") === "makni") {
    await env.DB.prepare(
      "DELETE FROM rijec_glas WHERE rijec_id = ? AND pozicija = ? AND glas_id = (SELECT id FROM glasovi WHERE slug = ?)",
    ).bind(id, String(f.get("pozicija")), String(f.get("glas"))).run();
  } else {
    await env.DB.prepare("UPDATE rijeci SET opis_za_sliku = ?, recenica = ? WHERE id = ?").bind(t("opis_za_sliku"), t("recenica"), id).run();
  }
  return new Response(null, { status: 303, headers: { location: safeNext(String(f.get("next") ?? "")) } });
};
