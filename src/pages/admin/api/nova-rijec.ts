import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { pojave, slug } from "../../../lib/fonemi";
import { dodajURed } from "../../../lib/generiranje";
import { stil } from "../../../lib/katalog";
import { novaGrupa, sZapisom } from "../../../lib/aktivnost";

const DOPUSTENO = /^[a-zčćđšž]+(?:[ -][a-zčćđšž]+)*$/;

/**
 * Nova riječ iz kataloga. Glasovi i pozicije se ponovno izvode na serveru; spremaju se samo
 * one koje je admin ostavio označene, s `potvrdeno = 1` (vidio ih je i potvrdio u formi).
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const f = await request.formData();
  const t = (k: string, max = 300) => { const v = String(f.get(k) ?? "").trim(); return v ? v.slice(0, max) : null; };
  const natrag = (greska: string) => {
    const u = new URLSearchParams();
    for (const k of ["rijec", "opis_za_sliku", "recenica", "rima"]) u.set(k, String(f.get(k) ?? ""));
    u.set("greska", greska);
    return new Response(null, { status: 303, headers: { location: `/admin/nova-rijec?${u}` } });
  };

  const rijec = String(f.get("rijec") ?? "").trim().toLocaleLowerCase("hr").replace(/\s+/g, " ");
  if (!rijec || rijec.length > 40 || !DOPUSTENO.test(rijec)) return natrag("Riječ smije imati samo hrvatska slova (do 40).");

  const db = env.DB;
  const postoji = await db.prepare("SELECT id, slug, aktivna, vrsta FROM rijeci WHERE rijec = ?").bind(rijec).first<{ id: number; slug: string; aktivna: number; vrsta: string }>();
  if (postoji?.vrsta === "znak") return natrag(`„${rijec}” je znak u katalogu (/admin/znakovi), ne riječ.`);
  if (postoji?.aktivna) return new Response(null, { status: 303, headers: { location: `/admin/rijec/${postoji.slug}?postoji=1` } });

  const { results: glasovi } = await db.prepare("SELECT id, oznaka, skupine FROM glasovi").all<{ id: number; oznaka: string; skupine: number }>();
  const izvedeno = pojave(rijec, glasovi.map((g) => g.oznaka), glasovi.filter((g) => g.skupine).map((g) => g.oznaka));
  const odabrano = new Set(f.getAll("pozicija").map(String));
  const spremi = izvedeno.filter((p) => odabrano.has(`${p.glas}|${p.pozicija}`));
  const idGlasa = new Map(glasovi.map((g) => [g.oznaka, g.id]));
  const rima = t("rima", 12)?.replace(/^-/, "").toLocaleUpperCase("hr") ?? null;

  // Neaktivna (npr. prije maknuta) se vraća i dobiva nove podatke; inače nova, izvor 'admin'.
  // Riječ, glasovi i poslovi u redu su jedna grupa u dnevniku: „Poništi” ih vraća zajedno.
  const email = locals.admin!.email;
  const grupa = novaGrupa();
  const idRijeci = "(SELECT id FROM rijeci WHERE rijec = ?)";
  const upisano = await db.batch(sZapisom({ tko: email, radnja: "rijec.nova", tablica: "rijeci", grupa },
    { sql: idRijeci, args: [rijec] }, [
      db.prepare(
        `INSERT INTO rijeci (rijec, slug, opis_za_sliku, recenica, rima, izvor) VALUES (?, ?, ?, ?, ?, 'admin')
         ON CONFLICT(rijec) DO UPDATE SET aktivna = 1, opis_za_sliku = excluded.opis_za_sliku, recenica = excluded.recenica, rima = excluded.rima`,
      ).bind(rijec, slug(rijec), t("opis_za_sliku"), t("recenica"), rima),
      ...spremi.map((p) =>
        db.prepare(`INSERT OR REPLACE INTO rijec_glas (rijec_id, glas_id, pozicija, potvrdeno) VALUES (${idRijeci}, ?, ?, 1)`)
          .bind(rijec, idGlasa.get(p.glas)!, p.pozicija)),
    ])).then(() => true, () => false); // slug već zauzet drugom riječju (UNIQUE)
  const r = upisano && await db.prepare("SELECT id, slug FROM rijeci WHERE rijec = ?").bind(rijec).first<{ id: number; slug: string }>();
  if (!r) return natrag(`Adresa „${slug(rijec)}” je već zauzeta drugom riječju.`);

  let uRed = 0;
  for (const kod of f.getAll("generiraj").map(String)) {
    uRed += await dodajURed(await stil(kod), [r.id], email, undefined, grupa).catch(() => 0);
  }
  return new Response(null, { status: 303, headers: { location: `/admin/rijec/${r.slug}?nova=1${uRed ? `&dodano=${uRed}` : ""}` } });
};
