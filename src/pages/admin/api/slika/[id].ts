import type { APIRoute } from "astro";
import { odluci } from "../../../../lib/generiranje";
import { safeNext } from "../../../../lib/admin/sesija";
import { env } from "cloudflare:workers";
import { dodajURed } from "../../../../lib/generiranje";
import { stil } from "../../../../lib/katalog";

/** Odobri / odbij (`ponovi`: i nova u red) / vrati kandidata. JSON za pregled (fetch), preusmjeravanje za obične forme. */
export const POST: APIRoute = async ({ request, params, locals }) => {
  const jsonZahtjev = (request.headers.get("content-type") ?? "").includes("application/json");
  const b: Record<string, string> = jsonZahtjev
    ? await request.json<Record<string, string>>().catch(() => ({}))
    : Object.fromEntries([...(await request.formData()).entries()].map(([k, v]) => [k, String(v)]));
  const akcija = b.akcija as "odobri" | "odbij" | "vrati";
  if (!["odobri", "odbij", "vrati"].includes(akcija)) return Response.json({ error: "akcija" }, { status: 400 });
  const id = Number(params.id);
  const ok = await odluci(id, akcija, locals.admin!.email, b.razlog);
  // Odbijena bez drugog kandidata: odmah nova u red (razlog ulazi u prompt).
  if (ok && akcija === "odbij" && b.ponovi) {
    const s = await env.DB.prepare("SELECT rijec_id, stil_id FROM slike WHERE id = ?").bind(id).first<{ rijec_id: number; stil_id: number }>();
    const st = await env.DB.prepare("SELECT kod FROM stilovi WHERE id = ?").bind(s!.stil_id).first<{ kod: string }>();
    await dodajURed(await stil(st!.kod), [s!.rijec_id], locals.admin!.email);
  }
  if (jsonZahtjev) return Response.json({ ok }, { status: ok ? 200 : 404 });
  return new Response(null, { status: 303, headers: { location: safeNext(b.next) } });
};
