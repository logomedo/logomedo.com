import type { APIRoute } from "astro";
import { korisnikId, logopedskiMod, stvori, sveRijeci, zaListic } from "../../../../lib/zadaci/baza";
import { brojSlika, ciljeviGlasova, izaberi, jePoGlasovima, moguce, naslovListica, odgovara, POZICIJE_LISTICA, rasporedOdnosa, redovaZaGlasove, RIMA_MAX_SLOGOVA } from "../../../../lib/zadaci/listic-glas";
import { jeOdnos } from "../../../../lib/zadaci/odnosi";
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

  // Po glasovima (samo u logopedskom modu): riječi sa slikom s barem jednim odabranim glasom na poziciji,
  // bez isključenih glasova. Listić i prebrajanje uzimaju samo njih; odnos (rima, prvi glas…) ih stavlja na zadanu sliku.
  const glasovi = f.getAll("glas").map(Number).filter((n) => n > 0);
  const pozicija = String(f.get("pozicija") ?? "");
  const bez = f.getAll("bez").map(String).filter((x) => ABECEDA.includes(x));
  const poGlasovima = f.get("po_glasovima") === "1" && jePoGlasovima(vrsta) && pozicija in POZICIJE_LISTICA && await logopedskiMod(locals.admin!.email);
  const nacin = String(f.get("nacin") ?? "");
  const zadano = { stavki: vrsta === "slogovi" ? 8 : vrsta === "listic" ? 12 : 4, maxSlogova: RIMA_MAX_SLOGOVA, nacin };
  const prazno = () => new Response(null, { status: 303, headers: { location: "/admin/predlosci?prazno=1" } });
  if (poGlasovima) {
    const k = await zaListic();
    const filtar = { glasovi, pozicija: glasovi.length ? pozicija : "", bez };
    const oznake = k.glasovi.filter((g) => glasovi.includes(g.id)).map((g) => g.oznaka);
    if (vrsta === "listic") {
      const izbor = k.rijeci.filter((r) => odgovara(r, filtar));
      if (!izbor.length) return prazno();
      naslov = naslovListica(oznake, filtar.pozicija, bez);
      // Odabrani broj slika (zadano 12): kad riječi ima više, nasumično; „sve” daje sve abecedno.
      const kartice = izaberi(izbor, brojSlika(f.get("broj") as string | null, MAX_KARTICA_LISTICA));
      sadrzaj = { kartice: kartice.map(kartica), raspored: "auto" };
    } else if (vrsta === "prvi_glas") {
      // Glasovi su slova krugova; pozicija i „bez” ovdje ne vrijede (traži se početak riječi, ometači su bilo koji).
      const slova = oznake.filter((o) => ABECEDA.includes(o));
      if (!slova.length) return prazno();
      sadrzaj = slozi(vrsta, zaGenerator(await sveRijeci()).filter((r) => r.slika), { ...zadano, slova });
      naslov = naslovListica(slova, "", []);
    } else {
      const saSlikom = new Map(k.rijeci.map((r) => [r.id, r]));
      const rijeci = zaGenerator(await sveRijeci()).filter((r) => { const g = saSlikom.get(r.id); return g && odgovara(g, { glasovi: [], pozicija: "", bez }); });
      const cilj = glasovi.length ? (r: { id: number }) => odgovara(saSlikom.get(r.id)!, filtar) : undefined;
      if (vrsta === "slogovi") {
        if (!moguce(vrsta, k.rijeci, filtar)) return prazno();
        sadrzaj = slozi(vrsta, rijeci, { ...zadano, cilj });
      } else {
        // Uparivanje, povezivanje, uljez: po jedan red (par) za svaki odabrani glas, redom (C, S, Z…).
        if (!rasporedOdnosa(vrsta, k.rijeci, filtar, jeOdnos(nacin) ? nacin : "rima").redova) return prazno();
        const ciljevi = ciljeviGlasova(filtar).map((c) => (r: { id: number }) => c(saSlikom.get(r.id)!));
        sadrzaj = slozi(vrsta, rijeci, glasovi.length ? { ...zadano, stavki: redovaZaGlasove(vrsta, glasovi.length), ciljevi } : zadano);
      }
      naslov = naslovListica(oznake, filtar.pozicija, bez);
    }
  } else {
    sadrzaj = slozi(vrsta, zaGenerator(await sveRijeci()), zadano);
  }
  const id = await stvori(await korisnikId(locals.admin!.email), vrsta, podrucje, naslov, zadanaUputa(vrsta, sadrzaj), sadrzaj);
  return new Response(null, { status: 303, headers: { location: `/admin/zadaci/${id}` } });
};
