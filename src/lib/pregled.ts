// Kandidati za pregled (stranica /admin/pregled i njeno osvježavanje uživo).
import { env } from "cloudflare:workers";

export interface Kandidat {
  id: number; prompt: string | null; model: string | null; rijec: string; slug: string;
  opis_za_sliku: string | null; odobrena_id: number | null; pozicije: string;
}

export async function kandidati(glas: string | null): Promise<Kandidat[]> {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.prompt, s.model, r.rijec, r.slug, r.opis_za_sliku,
       (SELECT o.id FROM slike o WHERE o.rijec_id = s.rijec_id AND o.stil_id = s.stil_id AND o.status = 'odobrena') AS odobrena_id,
       (SELECT group_concat(g.oznaka || ' ' || rg.pozicija, ' · ') FROM rijec_glas rg JOIN glasovi g ON g.id = rg.glas_id WHERE rg.rijec_id = r.id) AS pozicije
     FROM slike s JOIN rijeci r ON r.id = s.rijec_id
     WHERE s.status = 'kandidat' AND r.aktivna = 1
       AND (?1 IS NULL OR EXISTS (SELECT 1 FROM rijec_glas rg JOIN glasovi g ON g.id = rg.glas_id WHERE rg.rijec_id = r.id AND g.slug = ?1))
     ORDER BY s.id LIMIT 200`,
  ).bind(glas).all<Kandidat>();
  return results;
}

/** Odluke zadnjih 30 min: da pregled može reći tko je bio brži. */
export async function nedavneOdluke(): Promise<{ id: number; status: string; pregledao: string | null }[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, status, pregledao FROM slike WHERE status != 'kandidat' AND pregledano_at > datetime('now', '-30 minutes')",
  ).all<{ id: number; status: string; pregledao: string | null }>();
  return results;
}
