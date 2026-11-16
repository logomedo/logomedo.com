import type { APIRoute } from "astro";
import { obrisi, spremi } from "../../../../lib/zadaci/baza";
import { autorFiltar } from "../../../../lib/admin/vlasnistvo";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });

/** JSON: spremanje iz editora. Form `akcija=obrisi`: meko brisanje. Tuđi zadatak (logoped): 404. */
export const POST: APIRoute = async ({ request, params, locals }) => {
  const id = Number(params.id);
  const autor = autorFiltar(locals.admin!);
  if ((request.headers.get("content-type") ?? "").startsWith("application/json")) {
    const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return json({ error: "Neispravan JSON" }, 400);
    const verzija = await spremi(id, {
      naslov: String(b.naslov ?? ""), uputa: String(b.uputa ?? ""),
      podrucje_id: Number(b.podrucje_id) || null, stil: String(b.stil ?? ""), sadrzaj: b.sadrzaj, okvir: b.okvir,
    }, autor);
    return verzija === null ? json({ error: "Nema zadatka" }, 404) : json({ verzija });
  }
  const f = await request.formData();
  if (f.get("akcija") === "obrisi" && !(await obrisi(id, autor))) return new Response("Nema tog zadatka", { status: 404 });
  return new Response(null, { status: 303, headers: { location: "/admin/zadaci" } });
};
