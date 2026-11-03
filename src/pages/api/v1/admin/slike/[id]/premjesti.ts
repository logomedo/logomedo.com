import type { APIRoute } from "astro";
import { admin, greska } from "../../../../../../lib/app/api";
import { premjesti } from "../../../../../../lib/generiranje";

/** { rijec, dorada?, trajno?, ponovi? }: slika ide drugoj (ili novoj) riječi, original se odbija. */
export const POST: APIRoute = async (ctx) => {
  const s = admin(ctx);
  if (!s) return greska("forbidden", 403);
  const b = (await ctx.request.json().catch(() => ({}))) as { rijec?: string; dorada?: string; trajno?: boolean; ponovi?: boolean };
  const ishod = await premjesti(Number(ctx.params.id), String(b.rijec ?? ""), s.email, { dorada: b.dorada, trajno: Boolean(b.trajno), ponovi: Boolean(b.ponovi) });
  return Response.json(ishod, { status: ishod.ok ? 200 : "nema" in ishod ? 404 : "vec" in ishod ? 409 : 400 });
};
