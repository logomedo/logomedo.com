import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { obrisiRijec } from "../../../../lib/generiranje";

/** JSON { slug }: riječ ne postoji, makni je iz kataloga sa svim slikama (poništava se iz Aktivnosti). */
export const POST: APIRoute = async ({ request, locals }) => {
  const b = await request.json<{ slug?: string }>().catch(() => ({} as { slug?: string }));
  const r = await env.DB.prepare("SELECT id FROM rijeci WHERE slug = ?").bind(String(b.slug ?? "")).first<{ id: number }>();
  if (!r) return Response.json({ greska: "Nema te riječi." }, { status: 404 });
  return Response.json(await obrisiRijec(r.id, locals.admin!.email));
};
