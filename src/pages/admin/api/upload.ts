import type { APIRoute } from "astro";
import { MAX_BAJTOVA, ucitaj } from "../../../lib/generiranje";
import { safeNext } from "../../../lib/admin/sesija";
import { dimenzije } from "../../../lib/dimenzije";

/** Ručni upload: slika iz vanjskog alata + prompt kako je nastala. Ulazi kao kandidat. */
export const POST: APIRoute = async ({ request, locals }) => {
  const f = await request.formData();
  const next = new URL(safeNext(String(f.get("next") ?? "")), "http://x");
  const natrag = (k: string, v: string) => {
    next.searchParams.set(k, v);
    return new Response(null, { status: 303, headers: { location: next.pathname + next.search } });
  };
  const datoteka = f.get("slika");
  const prompt = String(f.get("prompt") ?? "").trim().slice(0, 4000);
  const alat = String(f.get("alat") ?? "").trim().slice(0, 100) || null;
  if (!(datoteka instanceof File) || !datoteka.size) return natrag("greska", "Odaberi sliku.");
  if (datoteka.size > MAX_BAJTOVA) return natrag("greska", "Slika je veća od 8 MB.");
  if (!prompt) return natrag("greska", "Upiši prompt kako je slika nastala.");
  const tijelo = await datoteka.arrayBuffer();
  const r = await ucitaj(Number(f.get("rijec")), String(f.get("stil") || "bojanka"), datoteka.type, tijelo, prompt, alat, locals.admin!.email);
  if ("greska" in r) return natrag("greska", r.greska);
  // Katalog je kvadratan: nekvadratna slika se prima, ali uz upozorenje (kvadratnu verziju radi scripts/kvadrat.py).
  const d = dimenzije(new Uint8Array(tijelo));
  if (d && d.sirina !== d.visina) next.searchParams.set("oblik", `${d.sirina}×${d.visina}`);
  return natrag("ucitano", String(r.slikaId));
};
