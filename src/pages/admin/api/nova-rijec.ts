import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { pojave, slug } from "../../../lib/fonemi";
import { dodajURed } from "../../../lib/generiranje";
import { stil } from "../../../lib/katalog";

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
  const postoji = await db.prepare("SELECT id, slug, aktivna FROM rijeci WHERE rijec = ?").bind(rijec).first<{ id: number; slug: string; aktivna: number }>();
  if (postoji?.aktivna) return new Response(null, { status: 303, headers: { location: `/admin/rijec/${postoji.slug}?postoji=1` } });

  const { results: glasovi } = await db.prepare("SELECT id, oznaka, skupine FROM glasovi").all<{ id: number; oznaka: string; skupine: number }>();
  const izvedeno = pojave(rijec, glasovi.map((g) => g.oznaka), glasovi.filter((g) => g.skupine).map((g) => g.oznaka));
  const odabrano = new Set(f.getAll("pozicija").map(String));
  const spremi = izvedeno.filter((p) => odabrano.has(`${p.glas}|${p.pozicija}`));
  const idGlasa = new Map(glasovi.map((g) => [g.oznaka, g.id]));
  const rima = t("rima", 12)?.replace(/^-/, "").toLocaleUpperCase("hr") ?? null;

  // Neaktivna (npr. prije maknuta) se vraća i dobiva nove podatke; inače nova, izvor 'admin'.
  const r = await db.prepare(
    `INSERT INTO rijeci (rijec, slug, opis_za_sliku, recenica, rima, izvor) VALUES (?, ?, ?, ?, ?, 'admin')
     ON CONFLICT(rijec) DO UPDATE SET aktivna = 1, opis_za_sliku = excluded.opis_za_sliku, recenica = excluded.recenica, rima = excluded.rima
     RETURNING id, slug`,
  ).bind(rijec, slug(rijec), t("opis_za_sliku"), t("recenica"), rima).first<{ id: number; slug: string }>()
    .catch(() => null); // slug već zauzet drugom riječju (UNIQUE)
  if (!r) return natrag(`Adresa „${slug(rijec)}” je već zauzeta drugom riječju.`);
  if (spremi.length) {
    await db.batch(spremi.map((p) =>
      db.prepare("INSERT OR REPLACE INTO rijec_glas (rijec_id, glas_id, pozicija, potvrdeno) VALUES (?, ?, ?, 1)")
        .bind(r.id, idGlasa.get(p.glas)!, p.pozicija),
    ));
  }

  let uRed = 0;
  for (const kod of f.getAll("generiraj").map(String)) {
    uRed += await dodajURed(await stil(kod), [r.id], locals.admin!.email).catch(() => 0);
  }
  return new Response(null, { status: 303, headers: { location: `/admin/rijec/${r.slug}?nova=1${uRed ? `&dodano=${uRed}` : ""}` } });
};
