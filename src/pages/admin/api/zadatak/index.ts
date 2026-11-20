import type { APIRoute } from "astro";
import { korisnikId, spremi, stvori } from "../../../../lib/zadaci/baza";
import { jeVrsta, normaliziraj } from "../../../../lib/zadaci/vrste";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });

/**
 * JSON: spremi nacrt iz urednika kao novi zadatak (tek sad nastaje u bazi), vraća { id }.
 * Forma s predloška (stari put) ide na /admin/zadaci/novi, koji složi nacrt bez spremanja.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json"))
    return new Response(null, { status: 307, headers: { location: "/admin/zadaci/novi" } });
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const vrsta = String(b?.vrsta ?? "");
  if (!b || !jeVrsta(vrsta)) return json({ error: "Neispravan zadatak" }, 400);
  const email = locals.admin!.email;
  const x = {
    naslov: String(b.naslov ?? ""), uputa: String(b.uputa ?? ""),
    podrucje_id: Number(b.podrucje_id) || null, stil: String(b.stil ?? ""), sadrzaj: b.sadrzaj, okvir: b.okvir,
  };
  const id = await stvori(await korisnikId(email), vrsta, x.podrucje_id, x.naslov.slice(0, 200), x.uputa.slice(0, 400), normaliziraj(vrsta, x.sadrzaj));
  // Stil i okvir (stvori ih ne zna) upiše spremi u istu verziju 1.
  await spremi(id, x, null);
  return json({ id });
};
