import type { APIRoute } from "astro";
import { vrati } from "../../../../lib/aktivnost";

/**
 * { smjer: "ponisti" | "vrati" } za cijelu grupu zapisa. Ne briše povijest: primijeni snimak
 * (prije ili poslije) kao novu izmjenu, koja dobiva svoj zapis na vrhu dnevnika.
 */
export const POST: APIRoute = async ({ request, params, locals }) => {
  const b = (await request.json().catch(() => ({}))) as { smjer?: string };
  if (b.smjer !== "ponisti" && b.smjer !== "vrati") return Response.json({ error: "smjer" }, { status: 400 });
  const r = await vrati(Number(params.id), b.smjer, locals.admin!.email);
  return Response.json(r, { status: r.ok ? 200 : 409 });
};
