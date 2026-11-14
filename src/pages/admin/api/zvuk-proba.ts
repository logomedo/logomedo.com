import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { GreskaElevenLabs } from "../../../lib/elevenlabs";
import { obrisiProbu, ocijeniGlas, ocijeniProbu, proba, probaTocna } from "../../../lib/zvuk-probe";

/** Snimka probe iz privatnog R2: GET ?id=. */
export const GET: APIRoute = async ({ url }) => {
  const p = await env.DB.prepare("SELECT r2_kljuc FROM zvuk_probe WHERE id = ?").bind(Number(url.searchParams.get("id"))).first<{ r2_kljuc: string }>();
  const o = p && (await env.SLIKE.get(p.r2_kljuc));
  if (!o) return new Response("Nema probe", { status: 404 });
  return new Response(o.body, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=31536000, immutable" } });
};

/**
 * Probe glasova (/admin/zvukovi/glasovi), JSON:
 *  { akcija: "snimi", glas, ime, nacin, tekst } → proba (postojeća ne košta ništa)
 *  { akcija: "ocijeni", id, ocjena: 1 | -1 | null, napomena }
 *  { akcija: "glas", glas, ime, ocjena, napomena }  ocjena cijelog glasa
 *  { akcija: "obrisi", id }
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const email = locals.admin!.email;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ocjena = b.ocjena === 1 || b.ocjena === -1 ? b.ocjena : null;
  const napomena = typeof b.napomena === "string" ? b.napomena.slice(0, 500) : null;
  const glas = String(b.glas ?? "");
  const ime = typeof b.ime === "string" ? b.ime.slice(0, 80) : null;
  if (b.akcija === "ocijeni") { await ocijeniProbu(Number(b.id), ocjena, napomena, email); return Response.json({ ok: true }); }
  if (b.akcija === "obrisi") { await obrisiProbu(Number(b.id)); return Response.json({ ok: true }); }
  if (!/^[A-Za-z0-9]{10,40}$/.test(glas)) return Response.json({ greska: "krivi glas" }, { status: 400 });
  if (b.akcija === "glas") { await ocijeniGlas(glas, ime, ocjena, napomena, email); return Response.json({ ok: true }); }
  if (b.akcija === "snimi") {
    const nacin = String(b.nacin ?? "");
    const tekst = String(b.tekst ?? "").trim().slice(0, 200);
    if (!/^[a-z0-9_]{3,40}(\+(kontekst|rez))?$/.test(nacin) || !tekst) return Response.json({ greska: "treba način i tekst" }, { status: 400 });
    try {
      const p = await proba(glas, ime, nacin, tekst);
      return Response.json({ ok: true, proba: p, tocna: probaTocna(p) });
    } catch (e) {
      return Response.json({ greska: String(e instanceof Error ? e.message : e) }, { status: e instanceof GreskaElevenLabs ? 502 : 500 });
    }
  }
  return Response.json({ greska: "nepoznata akcija" }, { status: 400 });
};
