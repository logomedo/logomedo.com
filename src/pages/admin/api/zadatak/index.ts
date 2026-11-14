import type { APIRoute } from "astro";
import { korisnikId, stvori, sveRijeci, zaListic } from "../../../../lib/zadaci/baza";
import { naslovListica, odgovara, POZICIJE_LISTICA } from "../../../../lib/zadaci/listic-glas";
import { ABECEDA, jeVrsta, MAX_KARTICA_LISTICA, slozi, zadanaUputa, zaGenerator, type Sadrzaj } from "../../../../lib/zadaci/vrste";

const kartica = (r: { id: number; rijec: string }) => ({ rijec_id: r.id, tekst: r.rijec.toLocaleUpperCase("hr") });

/** Novi zadatak: odmah složen prijedlog iz kataloga, pa u editor. */
export const POST: APIRoute = async ({ request, locals }) => {
  const f = await request.formData();
  const vrsta = String(f.get("vrsta"));
  if (!jeVrsta(vrsta)) return new Response("Nepoznata vrsta", { status: 400 });
  const podrucje = Number(f.get("podrucje")) || null;
  let sadrzaj: Sadrzaj;
  let naslov = "";

  // Listić po glasovima: riječi sa slikom s barem jednim odabranim glasom na poziciji, bez isključenih glasova.
  const glasovi = f.getAll("glas").map(Number).filter((n) => n > 0);
  const pozicija = String(f.get("pozicija") ?? "");
  const bez = f.getAll("bez").map(String).filter((x) => ABECEDA.includes(x));
  if (vrsta === "listic" && (glasovi.length || bez.length) && pozicija in POZICIJE_LISTICA) {
    const k = await zaListic();
    const izbor = k.rijeci.filter((r) => odgovara(r, { glasovi, pozicija, bez }));
    if (!izbor.length) return new Response(null, { status: 303, headers: { location: "/admin/predlosci?prazno=1" } });
    const oznake = k.glasovi.filter((g) => glasovi.includes(g.id)).map((g) => g.oznaka);
    naslov = naslovListica(oznake, pozicija, bez);
    // S odabranim glasovima sve riječi abecedno (logoped izbacuje); samo „bez” daje 12 nasumičnih.
    const kartice = glasovi.length ? izbor.slice(0, MAX_KARTICA_LISTICA) : izbor.map((r) => [Math.random(), r] as const).sort((a, b) => a[0] - b[0]).slice(0, 12).map(([, r]) => r);
    sadrzaj = { kartice: kartice.map(kartica), raspored: "auto" };
  } else {
    sadrzaj = slozi(vrsta, zaGenerator(await sveRijeci()), { stavki: vrsta === "slogovi" ? 8 : vrsta === "listic" ? 12 : 4, maxSlogova: 3 });
  }
  const id = await stvori(await korisnikId(locals.admin!.email), vrsta, podrucje, naslov, zadanaUputa(vrsta, sadrzaj), sadrzaj);
  return new Response(null, { status: 303, headers: { location: `/admin/zadaci/${id}` } });
};
