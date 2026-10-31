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
  const ishod = await odluci(id, akcija, locals.admin!.email, b.razlog);
  // Odbijena: nova u red (razlog ulazi u prompt), ali samo ako riječ još nema odobrenu sliku ni
  // drugog kandidata. Inače „Odbij” na suvišnom kandidatu stvara novog, i tako u krug (astronaut, 31. 10.).
  let generira = false;
  if (ishod.ok && akcija === "odbij" && b.ponovi) {
    const s = await env.DB.prepare(
      `SELECT s.rijec_id, s.stil_id, st.kod,
         EXISTS (SELECT 1 FROM slike o WHERE o.rijec_id = s.rijec_id AND o.stil_id = s.stil_id AND o.status IN ('odobrena', 'kandidat')) AS pokrivena
       FROM slike s JOIN stilovi st ON st.id = s.stil_id WHERE s.id = ?`,
    ).bind(id).first<{ rijec_id: number; stil_id: number; kod: string; pokrivena: number }>();
    if (s && !s.pokrivena) generira = (await dodajURed(await stil(s.kod), [s.rijec_id], locals.admin!.email)) > 0;
  }
  if (jsonZahtjev) return Response.json({ ...ishod, generira }, { status: ishod.ok ? 200 : ishod.nema ? 404 : 409 });
  return new Response(null, { status: 303, headers: { location: safeNext(b.next) } });
};
