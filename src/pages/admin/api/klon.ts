import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { GreskaElevenLabs } from "../../../lib/elevenlabs";
import { kloniraj, klon, obrisiKlon, obrisiUzorak, probaj, spremiUzorak, ukljuci, uzorak } from "../../../lib/klonovi";

/** Snimka iz privatnog R2: GET ?uzorak=id ili ?proba=klon/<id>/proba/<hash>.mp3 (samo superadmin, lib/admin/rute.ts). */
export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get("uzorak"), p = url.searchParams.get("proba");
  const kljuc = id ? (await uzorak(Number(id)))?.r2_kljuc : p && /^klon\/\d+\/proba\/[0-9a-f]{16}\.mp3$/.test(p) ? p : null;
  const o = kljuc ? await env.SLIKE.get(kljuc) : null;
  if (!o) return new Response("Nema snimke", { status: 404 });
  return new Response(o.body, { headers: { "content-type": o.httpMetadata?.contentType ?? "audio/mpeg", "cache-control": "private, max-age=31536000, immutable" } });
};

const broj = (v: FormDataEntryValue | null) => (v === null || v === "" ? NaN : Number(v));

/**
 * Klon (/admin/zvukovi/klonovi/<id>), multipart s poljem `akcija`:
 *  uzorak (klon, odlomak?, datoteka, trajanje, vrhDb, rmsDb, sumDb, pauza, klipova) · ukljuci (id, da) ·
 *  obrisi-uzorak (id) · kloniraj (klon, ukloniSum) · probaj (klon, model, tekst) · obrisi-klon (klon)
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const email = locals.admin!.email;
  const f = await request.formData();
  const a = String(f.get("akcija") ?? "");
  try {
    if (a === "ukljuci") { await ukljuci(Number(f.get("id")), f.get("da") === "1"); return Response.json({ ok: true }); }
    if (a === "obrisi-uzorak") { await obrisiUzorak(Number(f.get("id"))); return Response.json({ ok: true }); }
    const k = await klon(Number(f.get("klon")));
    if (!k || k.stanje === "obrisan") return Response.json({ greska: "Nema klona." }, { status: 404 });
    if (a === "uzorak") {
      const d = f.get("datoteka");
      if (!(d instanceof File)) return Response.json({ greska: "Nema datoteke." }, { status: 400 });
      const odl = broj(f.get("odlomak"));
      const m = { trajanje: broj(f.get("trajanje")), vrhDb: broj(f.get("vrhDb")), rmsDb: broj(f.get("rmsDb")), sumDb: broj(f.get("sumDb")), pauza: broj(f.get("pauza")), klipova: broj(f.get("klipova")) };
      if (!(m.trajanje > 0)) return Response.json({ greska: "Nepoznato trajanje snimke." }, { status: 400 });
      const mime = d.type === "audio/x-wav" || d.type === "audio/wave" ? "audio/wav" : d.type === "audio/mp3" ? "audio/mpeg" : d.type;
      const id = await spremiUzorak(k.id, Number.isInteger(odl) ? odl : null, await d.arrayBuffer(), mime, m, email);
      return Response.json({ ok: true, id });
    }
    if (a === "kloniraj") return Response.json({ ok: true, voice_id: await kloniraj(k, f.get("ukloniSum") === "1") });
    if (a === "probaj") {
      const model = String(f.get("model") ?? ""), tekst = String(f.get("tekst") ?? "").trim().slice(0, 1000);
      if (!/^[a-z0-9_]{3,40}$/.test(model) || !tekst) return Response.json({ greska: "Treba model i tekst." }, { status: 400 });
      return Response.json({ ok: true, proba: await probaj(k, model, tekst) });
    }
    if (a === "obrisi-klon") { await obrisiKlon(k); return Response.json({ ok: true }); }
    return Response.json({ greska: "Nepoznata akcija." }, { status: 400 });
  } catch (e) {
    return Response.json({ greska: String(e instanceof Error ? e.message : e) }, { status: e instanceof GreskaElevenLabs ? 502 : 400 });
  }
};
