import type { APIRoute } from "astro";
import { odluciIPonovi, promijeniStil, SAMO_SUPERADMIN_VRACA, uSmece } from "../../../../../lib/generiranje";
import { safeNext } from "../../../../../lib/admin/sesija";
import { postaviKvotuUAdresu } from "../../../../../lib/kvota";
import { NIJE_TVOJA, smijeOSlici } from "../../../../../lib/zatrazio";
import { smije } from "../../../../../lib/admin/ovlasti";

/** `akcija=stil` + `stil`: slika prelazi u drugi stil (bojanka ↔ ilustracija). Odobri / odbij (`razlog` što ne valja, `dorada` kako treba, `trajno`: dorada u opis riječi, `ponovi`: i nova u red) / vrati kandidata. JSON za pregled (fetch), preusmjeravanje za obične forme. */
export const POST: APIRoute = async ({ request, params, locals }) => {
  const jsonZahtjev = (request.headers.get("content-type") ?? "").includes("application/json");
  const b: Record<string, string> = jsonZahtjev
    ? await request.json<Record<string, string>>().catch(() => ({}))
    : Object.fromEntries([...(await request.formData()).entries()].map(([k, v]) => [k, String(v)]));
  // „Zapamti kao opis riječi” mijenja postojeću riječ: samo superadmin (katalog.uredivanje).
  const urednik = smije(locals.admin!.uloga, "katalog.uredivanje");
  // Logoped odlučuje samo o slikama koje je sam poslao (inače bi odobravao za drugoga).
  if (!(await smijeOSlici(Number(params.id), locals.admin!.email))) {
    return Response.json({ ok: false, poruka: NIJE_TVOJA, error: NIJE_TVOJA }, { status: 403 });
  }
  if (b.akcija === "stil") {
    const ishod = await promijeniStil(Number(params.id), String(b.stil ?? ""), locals.admin!.email);
    if (jsonZahtjev) return Response.json(ishod, { status: ishod.ok ? 200 : 400 });
    if (!ishod.ok) {
      const u = new URL(safeNext(b.next), request.url);
      u.searchParams.set("zabrana", ishod.greska);
      return new Response(null, { status: 303, headers: { location: u.pathname + u.search + u.hash } });
    }
    return new Response(null, { status: 303, headers: { location: safeNext(b.next) } });
  }
  // Odobrena slika ravno u odbijene (✕ na galeriji riječi): višak u istom stilu. Vraća se iz „Odobrene i odbijene”.
  if (b.akcija === "smece") {
    const ishod = bezTudjegEmaila(await uSmece(Number(params.id), locals.admin!.email), urednik, locals.admin!.email);
    if (jsonZahtjev) return Response.json(ishod, { status: ishod.ok ? 200 : "zabranjeno" in ishod && ishod.zabranjeno ? 403 : 409 });
    const u = new URL(safeNext(b.next), request.url);
    if (!ishod.ok) u.searchParams.set("zabrana", "zabranjeno" in ishod && ishod.zabranjeno ? SAMO_SUPERADMIN_VRACA : "Slika se u međuvremenu promijenila.");
    return new Response(null, { status: 303, headers: { location: u.pathname + u.search + u.hash } });
  }
  const akcija = b.akcija as "odobri" | "odbij" | "vrati";
  if (!["odobri", "odbij", "vrati"].includes(akcija)) return Response.json({ error: "akcija" }, { status: 400 });
  const ishod = bezTudjegEmaila(await odluciIPonovi(Number(params.id), akcija, locals.admin!.email, b.razlog, Boolean(b.ponovi), { dorada: b.dorada, trajno: Boolean(b.trajno) && urednik }), urednik, locals.admin!.email);
  if (jsonZahtjev) {
    if ("zabranjeno" in ishod && ishod.zabranjeno) return Response.json({ ...ishod, poruka: SAMO_SUPERADMIN_VRACA, error: SAMO_SUPERADMIN_VRACA }, { status: 403 });
    return Response.json(ishod, { status: ishod.ok ? 200 : "nema" in ishod && ishod.nema ? 404 : 409 });
  }
  if ("zabranjeno" in ishod && ishod.zabranjeno) {
    const u = new URL(safeNext(b.next), request.url);
    u.searchParams.set("zabrana", SAMO_SUPERADMIN_VRACA);
    return new Response(null, { status: 303, headers: { location: u.pathname + u.search + u.hash } });
  }
  // Odluka je spremljena, ali novi posao nije prošao kvotu: banner kvote na stranici povratka.
  if ("upozorenje" in ishod && ishod.upozorenje) {
    const u = postaviKvotuUAdresu(new URL(safeNext(b.next), request.url), "slike", 1);
    return new Response(null, { status: 303, headers: { location: u.pathname + u.search + u.hash } });
  }
  return new Response(null, { status: 303, headers: { location: safeNext(b.next) } });
};

/** Logoped ne vidi tuđi e-mail u „već je odlučio” (revizija 18. 11. 2026.); superadmin da. */
function bezTudjegEmaila<T extends object>(ishod: T, superadmin: boolean, ja: string): T {
  if (superadmin || !("vec" in ishod) || !ishod.vec) return ishod;
  const vec = ishod.vec as { status: string; pregledao: string | null };
  const moj = (vec.pregledao ?? "").toLowerCase() === ja.trim().toLowerCase();
  return { ...ishod, vec: { ...vec, pregledao: moj ? vec.pregledao : null } };
}
