import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

/** Slika iz R2. Zasad samo za admin (kandidati nisu javni). Ključ je hash sadržaja, pa se smije dugo keširati. */
export const GET: APIRoute = async ({ params }) => {
  const s = await env.DB.prepare("SELECT r2_kljuc, mime FROM slike WHERE id = ?").bind(Number(params.id)).first<{ r2_kljuc: string; mime: string }>();
  const o = s && (await env.SLIKE.get(s.r2_kljuc));
  if (!o) return new Response("Nema slike", { status: 404 });
  return new Response(o.body, { headers: { "content-type": s.mime, "cache-control": "private, max-age=31536000, immutable" } });
};
