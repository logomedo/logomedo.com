import type { APIRoute } from "astro";
import { obrisi, spremi } from "../../../../lib/zadaci/baza";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });

/** JSON: spremanje iz editora. Form `akcija=obrisi`: meko brisanje. */
export const POST: APIRoute = async ({ request, params }) => {
  const id = Number(params.id);
  if ((request.headers.get("content-type") ?? "").startsWith("application/json")) {
    const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return json({ error: "Neispravan JSON" }, 400);
    const verzija = await spremi(id, {
      naslov: String(b.naslov ?? ""), uputa: String(b.uputa ?? ""),
      podrucje_id: Number(b.podrucje_id) || null, sadrzaj: b.sadrzaj,
    });
    return verzija === null ? json({ error: "Nema zadatka" }, 404) : json({ verzija });
  }
  const f = await request.formData();
  if (f.get("akcija") === "obrisi") await obrisi(id);
  return new Response(null, { status: 303, headers: { location: "/admin/zadaci" } });
};
