import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { svojiZvukovi } from "../../../lib/zvukovi";

/** Snimka iz privatnog R2 (kandidati i odbijeni nisu javni). Ključ je hash sadržaja. */
export const GET: APIRoute = async ({ params, locals }) => {
  const id = Number(params.id);
  const z = await env.DB.prepare("SELECT r2_kljuc, mime, status FROM zvukovi WHERE id = ?").bind(id).first<{ r2_kljuc: string; mime: string; status: string }>();
  // Logoped: odobrene i svoje (odbijene snimke glasova su glas stvarne osobe; revizija 18. 11. 2026.).
  if (z && z.status !== "odobren" && locals.admin!.uloga !== "superadmin" && !(await svojiZvukovi([id], locals.admin!.email)).length) {
    return new Response("Nema snimke", { status: 404 });
  }
  const o = z && (await env.SLIKE.get(z.r2_kljuc));
  if (!o) return new Response("Nema snimke", { status: 404 });
  return new Response(o.body, { headers: { "content-type": z.mime, "cache-control": "private, max-age=31536000, immutable" } });
};
