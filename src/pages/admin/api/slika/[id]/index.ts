import type { APIRoute } from "astro";
import { odluciIPonovi, promijeniStil } from "../../../../../lib/generiranje";
import { safeNext } from "../../../../../lib/admin/sesija";
import { postaviKvotuUAdresu } from "../../../../../lib/kvota";
import { NIJE_TVOJA, smijeOSlici } from "../../../../../lib/zatrazio";

/** `akcija=stil` + `stil`: slika prelazi u drugi stil (bojanka ↔ ilustracija). Odobri / odbij (`razlog` što ne valja, `dorada` kako treba, `trajno`: dorada u opis riječi, `ponovi`: i nova u red) / vrati kandidata. JSON za pregled (fetch), preusmjeravanje za obične forme. */
export const POST: APIRoute = async ({ request, params, locals }) => {
  const jsonZahtjev = (request.headers.get("content-type") ?? "").includes("application/json");
  const b: Record<string, string> = jsonZahtjev
    ? await request.json<Record<string, string>>().catch(() => ({}))
    : Object.fromEntries([...(await request.formData()).entries()].map(([k, v]) => [k, String(v)]));
  // Logoped odlučuje samo o slikama koje je sam poslao (inače bi odobravao za drugoga).
  if (!(await smijeOSlici(Number(params.id), locals.admin!.email))) {
    return Response.json({ ok: false, poruka: NIJE_TVOJA, error: NIJE_TVOJA }, { status: 403 });
  }
  if (b.akcija === "stil") {
    const ishod = await promijeniStil(Number(params.id), String(b.stil ?? ""), locals.admin!.email);
    if (jsonZahtjev) return Response.json(ishod, { status: ishod.ok ? 200 : 400 });
    return new Response(null, { status: 303, headers: { location: safeNext(b.next) } });
  }
  const akcija = b.akcija as "odobri" | "odbij" | "vrati";
  if (!["odobri", "odbij", "vrati"].includes(akcija)) return Response.json({ error: "akcija" }, { status: 400 });
  const ishod = await odluciIPonovi(Number(params.id), akcija, locals.admin!.email, b.razlog, Boolean(b.ponovi), { dorada: b.dorada, trajno: Boolean(b.trajno) });
  if (jsonZahtjev) return Response.json(ishod, { status: ishod.ok ? 200 : "nema" in ishod && ishod.nema ? 404 : 409 });
  // Odluka je spremljena, ali novi posao nije prošao kvotu: banner kvote na stranici povratka.
  if ("upozorenje" in ishod && ishod.upozorenje) {
    const u = postaviKvotuUAdresu(new URL(safeNext(b.next), request.url), "slike", 1);
    return new Response(null, { status: 303, headers: { location: u.pathname + u.search + u.hash } });
  }
  return new Response(null, { status: 303, headers: { location: safeNext(b.next) } });
};
