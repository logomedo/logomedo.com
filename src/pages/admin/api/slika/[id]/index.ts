import type { APIRoute } from "astro";
import { odluciIPonovi } from "../../../../../lib/generiranje";
import { safeNext } from "../../../../../lib/admin/sesija";

/** Odobri / odbij (`razlog` što ne valja, `dorada` kako treba, `trajno`: dorada u opis riječi, `ponovi`: i nova u red) / vrati kandidata. JSON za pregled (fetch), preusmjeravanje za obične forme. */
export const POST: APIRoute = async ({ request, params, locals }) => {
  const jsonZahtjev = (request.headers.get("content-type") ?? "").includes("application/json");
  const b: Record<string, string> = jsonZahtjev
    ? await request.json<Record<string, string>>().catch(() => ({}))
    : Object.fromEntries([...(await request.formData()).entries()].map(([k, v]) => [k, String(v)]));
  const akcija = b.akcija as "odobri" | "odbij" | "vrati";
  if (!["odobri", "odbij", "vrati"].includes(akcija)) return Response.json({ error: "akcija" }, { status: 400 });
  const ishod = await odluciIPonovi(Number(params.id), akcija, locals.admin!.email, b.razlog, Boolean(b.ponovi), { dorada: b.dorada, trajno: Boolean(b.trajno) });
  if (jsonZahtjev) return Response.json(ishod, { status: ishod.ok ? 200 : "nema" in ishod && ishod.nema ? 404 : 409 });
  return new Response(null, { status: 303, headers: { location: safeNext(b.next) } });
};
