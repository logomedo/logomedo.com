import type { APIRoute } from "astro";
import { vrati } from "../../../../lib/aktivnost";
import { aktivnostFiltar } from "../../../../lib/admin/vlasnistvo";

/**
 * { smjer: "ponisti" | "vrati" } za cijelu grupu zapisa. Ne briše povijest: primijeni snimak
 * (prije ili poslije) kao novu izmjenu, koja dobiva svoj zapis na vrhu dnevnika.
 * Logoped smije samo svoje zapise bez administracije (odluka 9), inače 403.
 */
export const POST: APIRoute = async ({ request, params, locals }) => {
  const b = (await request.json().catch(() => ({}))) as { smjer?: string };
  if (b.smjer !== "ponisti" && b.smjer !== "vrati") return Response.json({ error: "smjer" }, { status: 400 });
  const r = await vrati(Number(params.id), b.smjer, locals.admin!.email, aktivnostFiltar(locals.admin!));
  if (!r.ok && r.zabranjeno) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json(r, { status: r.ok ? 200 : 409 });
};
