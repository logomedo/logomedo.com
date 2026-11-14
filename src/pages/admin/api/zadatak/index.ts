import type { APIRoute } from "astro";
import { korisnikId, rijeciSGlasom, stvori, sveRijeci } from "../../../../lib/zadaci/baza";
import { jeVrsta, MAX_KARTICA_LISTICA, slozi, zadanaUputa, zaGenerator, type Sadrzaj } from "../../../../lib/zadaci/vrste";

const POZICIJE: Record<string, string> = { "": "", inicijalna: "inicijalna pozicija", medijalna: "medijalna pozicija", finalna: "finalna pozicija", skupina: "skupine" };

/** Novi zadatak: odmah složen prijedlog iz kataloga, pa u editor. */
export const POST: APIRoute = async ({ request, locals }) => {
  const f = await request.formData();
  const vrsta = String(f.get("vrsta"));
  if (!jeVrsta(vrsta)) return new Response("Nepoznata vrsta", { status: 400 });
  const podrucje = Number(f.get("podrucje")) || null;
  const rijeci = zaGenerator(await sveRijeci());
  let sadrzaj: Sadrzaj;
  let naslov = "";

  // Listić za glas: sve riječi sa slikom koje imaju glas na odabranoj poziciji, abecedno.
  const glasId = Number(f.get("glas")) || 0;
  const pozicija = String(f.get("pozicija") ?? "");
  if (vrsta === "listic" && glasId && pozicija in POZICIJE) {
    const g = await rijeciSGlasom(glasId, pozicija);
    const izbor = g ? rijeci.filter((r) => g.ids.has(r.id) && r.slika) : [];
    if (!g || !izbor.length) return new Response(null, { status: 303, headers: { location: "/admin/predlosci?prazno=1" } });
    naslov = `Glas ${g.oznaka}${pozicija ? ` – ${POZICIJE[pozicija]}` : ""}`;
    sadrzaj = { kartice: izbor.slice(0, MAX_KARTICA_LISTICA).map((r) => ({ rijec_id: r.id, tekst: r.rijec.toLocaleUpperCase("hr") })), raspored: "auto" };
  } else {
    sadrzaj = slozi(vrsta, rijeci, { stavki: vrsta === "slogovi" ? 8 : vrsta === "listic" ? 12 : 4, maxSlogova: 3 });
  }
  const id = await stvori(await korisnikId(locals.admin!.email), vrsta, podrucje, naslov, zadanaUputa(vrsta, sadrzaj), sadrzaj);
  return new Response(null, { status: 303, headers: { location: `/admin/zadaci/${id}` } });
};
