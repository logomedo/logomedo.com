import type { APIRoute } from "astro";
import { korisnikId, stvori, sveRijeci } from "../../../../lib/zadaci/baza";
import { jeVrsta, slozi, VRSTE } from "../../../../lib/zadaci/vrste";

/** Novi zadatak: odmah složen prijedlog iz kataloga, pa u editor. */
export const POST: APIRoute = async ({ request, locals }) => {
  const f = await request.formData();
  const vrsta = String(f.get("vrsta"));
  if (!jeVrsta(vrsta)) return new Response("Nepoznata vrsta", { status: 400 });
  const podrucje = Number(f.get("podrucje")) || null;
  const sadrzaj = slozi(vrsta, await sveRijeci(), { stavki: 4, maxSlogova: 3 });
  const id = await stvori(await korisnikId(locals.admin!.email), vrsta, podrucje, "", VRSTE[vrsta].uputa, sadrzaj);
  return new Response(null, { status: 303, headers: { location: `/admin/zadaci/${id}` } });
};
