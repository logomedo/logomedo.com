import type { APIRoute } from "astro";
import { premjesti } from "../../../../../lib/generiranje";
import { NIJE_TVOJA, smijeOSlici } from "../../../../../lib/zatrazio";

/** Slika je za drugu riječ: { rijec, dorada?, trajno?, ponovi? }. Riječ koja ne postoji dodaje se u katalog. */
export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!(await smijeOSlici(Number(params.id), locals.admin!.email))) {
    return Response.json({ ok: false, poruka: NIJE_TVOJA, error: NIJE_TVOJA }, { status: 403 });
  }
  const b = await request.json<Record<string, string>>().catch(() => ({} as Record<string, string>));
  const ishod = await premjesti(Number(params.id), String(b.rijec ?? ""), locals.admin!.email,
    { dorada: b.dorada, trajno: Boolean(b.trajno), ponovi: Boolean(b.ponovi) });
  return Response.json(ishod, { status: ishod.ok ? 200 : "nema" in ishod ? 404 : "vec" in ishod ? 409 : 400 });
};
