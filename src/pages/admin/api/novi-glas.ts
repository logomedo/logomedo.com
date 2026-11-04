import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { oznakaGlasa, pojave, slug } from "../../../lib/fonemi";

/**
 * Novi glas u katalogu (npr. K). Sve riječi koje ga već imaju dobivaju ga odmah, s pozicijama
 * izvedenim iz pravopisa (`potvrdeno = 0`), kao u seedu: logoped ih potvrđuje na stranici glasa.
 */
export const POST: APIRoute = async ({ request }) => {
  const f = await request.formData();
  const natrag = (greska: string) => {
    const u = new URLSearchParams({ oznaka: String(f.get("oznaka") ?? ""), skupina: String(f.get("skupina") ?? ""), greska });
    return new Response(null, { status: 303, headers: { location: `/admin/novi-glas?${u}` } });
  };

  const oznaka = oznakaGlasa(String(f.get("oznaka") ?? ""));
  if (!oznaka) return natrag("Glas je jedno slovo ili dvoslov (DŽ, LJ, NJ).");
  const skupina = String(f.get("skupina") ?? "").trim().toLocaleLowerCase("hr").replace(/\s+/g, " ").slice(0, 30) || null;
  if (skupina && !/^[a-zčćđšž ]+$/.test(skupina)) return natrag("Kategorija smije imati samo slova.");
  const skupine = f.get("skupine") ? 1 : 0;

  const db = env.DB;
  const g = slug(oznaka);
  const postoji = await db.prepare("SELECT slug FROM glasovi WHERE oznaka = ? OR slug = ?").bind(oznaka, g).first<{ slug: string }>();
  if (postoji) return new Response(null, { status: 303, headers: { location: `/admin/glas/${postoji.slug}` } });

  const novi = await db.prepare(
    `INSERT INTO glasovi (oznaka, slug, skupina, skupine, redoslijed)
     VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(redoslijed), 0) + 1 FROM glasovi)) RETURNING id`,
  ).bind(oznaka, g, skupina, skupine).first<{ id: number }>();

  const { results: rijeci } = await db.prepare("SELECT id, rijec FROM rijeci").all<{ id: number; rijec: string }>();
  const veze = rijeci.flatMap((r) => pojave(r.rijec, [oznaka], skupine ? [oznaka] : []).map((p) => [r.id, p.pozicija] as const));
  // Po 30 redova u jednom INSERT-u (D1: najviše 100 parametara po upitu).
  const upiti: D1PreparedStatement[] = [];
  for (let i = 0; i < veze.length; i += 30) {
    const dio = veze.slice(i, i + 30);
    upiti.push(db.prepare(
      `INSERT OR IGNORE INTO rijec_glas (rijec_id, glas_id, pozicija, potvrdeno) VALUES ${dio.map(() => `(?, ${novi!.id}, ?, 0)`).join(", ")}`,
    ).bind(...dio.flat()));
  }
  if (upiti.length) await db.batch(upiti);
  return new Response(null, { status: 303, headers: { location: `/admin/glas/${g}?novi=${veze.length}` } });
};
