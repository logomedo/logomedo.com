import type { APIRoute } from "astro";
import { admin, greska } from "../../../../../../lib/app/api";
import { odluciIPonovi } from "../../../../../../lib/generiranje";

/** { akcija: odobri | odbij | vrati, razlog?, ponovi? }. 409 s `vec` ako je netko drugi već odlučio. */
export const POST: APIRoute = async (ctx) => {
  const s = admin(ctx);
  if (!s) return greska("forbidden", 403);
  const b = (await ctx.request.json().catch(() => ({}))) as { akcija?: string; razlog?: string; ponovi?: boolean };
  if (b.akcija !== "odobri" && b.akcija !== "odbij" && b.akcija !== "vrati") return greska("akcija", 400);
  const ishod = await odluciIPonovi(Number(ctx.params.id), b.akcija, s.email, b.razlog, Boolean(b.ponovi));
  return Response.json(ishod, { status: ishod.ok ? 200 : "nema" in ishod && ishod.nema ? 404 : 409 });
};
