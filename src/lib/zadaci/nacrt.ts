// Nacrt novog zadatka s predloška (docs/zadaci.md „Nacrt”): složen iz kataloga, ali nespremljen.
import { logopedskiMod, sveRijeci, zaListic } from "./baza";
import { brojSlika, ciljeviGlasova, izaberi, jePoGlasovima, moguce, naslovListica, odgovara, POZICIJE_LISTICA, rasporedOdnosa, redovaZaGlasove, RIMA_MAX_SLOGOVA } from "./listic-glas";
import { jeOdnos } from "./odnosi";
import { ABECEDA, brojStavki, jeVrsta, MAX_KARTICA_LISTICA, slozi, zadanaUputa, zaGenerator, type KojeSlovo, type Odabir, type PozicijaGlasa, type Sadrzaj, type Vrsta } from "./vrste";

const kartica = (r: { id: number; rijec: string }) => ({ rijec_id: r.id, tekst: r.rijec.toLocaleUpperCase("hr") });

export interface Nacrt { vrsta: Vrsta; podrucje_id: number | null; naslov: string; uputa: string; sadrzaj: Sadrzaj }

/**
 * Novi zadatak s predloška: prijedlog složen iz kataloga. **Ne sprema se**: urednik ga drži kao nacrt u
 * pregledniku (localStorage), a u bazu ide tek na „Spremi” (POST JSON na /admin/api/zadatak).
 * null = vrsta ne postoji; "prazno" = za odabrane glasove katalog nema dovoljno riječi.
 */
export async function slozNacrt(f: FormData, email: string): Promise<Nacrt | "prazno" | null> {
  const vrsta = String(f.get("vrsta"));
  if (!jeVrsta(vrsta)) return null;
  const podrucje = Number(f.get("podrucje")) || null;
  let sadrzaj: Sadrzaj;
  let naslov = "";

  // Po glasovima (samo u logopedskom modu): riječi sa slikom s barem jednim odabranim glasom na poziciji,
  // bez isključenih glasova. Listić i prebrajanje uzimaju samo njih; odnos (rima, prvi glas…) ih stavlja na zadanu sliku.
  const glasovi = f.getAll("glas").map(Number).filter((n) => n > 0);
  const pozicija = String(f.get("pozicija") ?? "");
  const bez = f.getAll("bez").map(String).filter((x) => ABECEDA.includes(x));
  const poGlasovima = f.get("po_glasovima") === "1" && jePoGlasovima(vrsta) && pozicija in POZICIJE_LISTICA && await logopedskiMod(email);
  const nacin = String(f.get("nacin") ?? "");
  // Broj redova (parova, slika, krugova) s kartice predloška ili iz dijaloga; bez njega zadano vrste.
  const zadano = { stavki: brojStavki(vrsta, f.get("stavki")), maxSlogova: RIMA_MAX_SLOGOVA, nacin };
  const prazno = () => "prazno" as const;
  if (poGlasovima) {
    const k = await zaListic();
    const oznake = k.glasovi.filter((g) => glasovi.includes(g.id)).map((g) => g.oznaka);
    // „Uz samoglasnike” (listić, slogovi): glas do kojeg su samo samoglasnici (SOK da, STOL ne).
    const uz = f.get("uz_samoglasnike") === "1" && (vrsta === "listic" || vrsta === "slogovi") && glasovi.length > 0 && pozicija !== "skupina";
    const filtar = { glasovi, pozicija: glasovi.length ? pozicija : "", bez, ...(uz ? { uz: oznake } : {}) };
    if (vrsta === "listic") {
      const izbor = k.rijeci.filter((r) => odgovara(r, filtar));
      if (!izbor.length) return prazno();
      naslov = naslovListica(oznake, filtar.pozicija, bez, uz);
      // Odabrani broj slika (zadano 12): kad riječi ima više, nasumično; „sve” daje sve abecedno.
      const kartice = izaberi(izbor, brojSlika(f.get("broj") as string | null, MAX_KARTICA_LISTICA));
      sadrzaj = { kartice: kartice.map(kartica), raspored: "auto" };
    } else if (vrsta === "prvi_glas") {
      // Glasovi su slova krugova; pozicija i „bez” ovdje ne vrijede (traži se početak riječi, ometači su bilo koji).
      const slova = oznake.filter((o) => ABECEDA.includes(o));
      if (!slova.length) return prazno();
      sadrzaj = slozi(vrsta, zaGenerator(await sveRijeci()).filter((r) => r.slika), { ...zadano, slova });
      naslov = naslovListica(slova, "", []);
    } else if (vrsta === "koje_slovo" || vrsta === "pozicija_glasa") {
      // Koji glas: svaki glas jedna stavka, ostali odabrani su joj ometači. Gdje je glas: jedan glas (prvi odabrani).
      const slova = oznake.filter((o) => ABECEDA.includes(o)).slice(0, vrsta === "pozicija_glasa" ? 1 : undefined);
      if (!slova.length) return prazno();
      const n = vrsta === "koje_slovo" ? slova.length : zadano.stavki;
      sadrzaj = slozi(vrsta, zaGenerator(await sveRijeci()).filter((r) => r.slika), { ...zadano, stavki: n, slova });
      if (vrsta === "pozicija_glasa" && !(sadrzaj as PozicijaGlasa).slike.length) return prazno();
      const odabrani = k.glasovi.filter((g) => slova.includes(g.oznaka));
      (sadrzaj as KojeSlovo | PozicijaGlasa).po_glasovima = { glasovi: odabrani.map((g) => g.id), oznake: odabrani.map((g) => g.oznaka), pozicija: "", bez: [] };
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
        if (!rasporedOdnosa(vrsta, k.rijeci, filtar, jeOdnos(nacin) ? nacin : "rima", zadano.stavki).redova) return prazno();
        const ciljevi = ciljeviGlasova(filtar).map((c) => (r: { id: number }) => c(saSlikom.get(r.id)!));
        sadrzaj = slozi(vrsta, rijeci, glasovi.length ? { ...zadano, stavki: redovaZaGlasove(vrsta, glasovi.length, zadano.stavki), ciljevi } : zadano);
        // Editor pamti odabir: birač slika nudi prvo riječi s tim glasovima, „Složi” slaže po njima.
        (sadrzaj as Odabir).po_glasovima = { glasovi, oznake, pozicija: filtar.pozicija, bez };
      }
      naslov = naslovListica(oznake, filtar.pozicija, bez, uz && vrsta === "slogovi");
    }
  } else {
    sadrzaj = slozi(vrsta, zaGenerator(await sveRijeci()), zadano);
  }
  return { vrsta, podrucje_id: podrucje, naslov, uputa: zadanaUputa(vrsta, sadrzaj), sadrzaj };
}
