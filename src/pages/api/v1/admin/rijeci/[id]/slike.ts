import type { APIRoute } from "astro";
import { admin, greska } from "../../../../../../lib/app/api";
import { MAX_BAJTOVA, ucitaj } from "../../../../../../lib/generiranje";

/** Upload iz aplikacije (multipart: slika, stil, prompt, alat). Ulazi kao kandidat, isto kao s weba. */
export const POST: APIRoute = async (ctx) => {
  const s = admin(ctx);
  if (!s) return greska("forbidden", 403);
  const f = await ctx.request.formData().catch(() => null);
  if (!f) return greska("multipart", 400);
  const datoteka = f.get("slika");
  const prompt = String(f.get("prompt") ?? "").trim().slice(0, 4000);
  const alat = String(f.get("alat") ?? "").trim().slice(0, 100) || null;
  if (!(datoteka instanceof File) || !datoteka.size) return greska("Odaberi sliku.", 400);
  if (datoteka.size > MAX_BAJTOVA) return greska("Slika je veća od 8 MB.", 413);
  if (!prompt) return greska("Upiši prompt kako je slika nastala.", 400);
  const r = await ucitaj(Number(ctx.params.id), String(f.get("stil") || "bojanka"), datoteka.type, await datoteka.arrayBuffer(), prompt, alat, s.email);
  return "greska" in r ? greska(r.greska, 409) : Response.json({ slika_id: r.slikaId }, { status: 201 });
};
