// Kandidati za pregled (stranica /admin/pregled i njeno osvježavanje uživo).
import { env } from "cloudflare:workers";
import { ZATRAZIO_SLIKE } from "./zatrazio";

export interface Kandidat {
  id: number; prompt: string | null; model: string | null; rijec: string; slug: string;
  opis_za_sliku: string | null; odobrena_id: number | null; odobrenih: number; pozicije: string;
  sirina: number | null; visina: number | null;
  /** Kvadratna varijanta: id originala koji odobrenje zamjenjuje, i njegove dimenzije. */
  zamjenjuje: number | null; z_sirina: number | null; z_visina: number | null;
  /** Tko je sliku poslao (e-mail malim slovima); null = nepoznato (stare slike). */
  zatrazio: string | null;
  /** Logoped ju je odobrio i čeka potvrdu superadmina (e-mail), inače null. */
  predlozio: string | null;
}

/** `vidi`: null = svi kandidati (superadmin), e-mail = samo oni koje je taj korisnik poslao. */
export async function kandidati(glas: string | null, vidi: string | null, logoped = false): Promise<Kandidat[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM (SELECT s.id, ${ZATRAZIO_SLIKE} AS zatrazio, lower(s.predlozio) AS predlozio, s.prompt, s.model, r.rijec, r.slug, r.opis_za_sliku, s.sirina, s.visina, s.zamjenjuje,
       (SELECT z.sirina FROM slike z WHERE z.id = s.zamjenjuje) AS z_sirina, (SELECT z.visina FROM slike z WHERE z.id = s.zamjenjuje) AS z_visina,
       (SELECT o.id FROM slike o WHERE o.rijec_id = s.rijec_id AND o.stil_id = s.stil_id AND o.status = 'odobrena' ORDER BY o.id DESC LIMIT 1) AS odobrena_id,
       (SELECT COUNT(*) FROM slike o WHERE o.rijec_id = s.rijec_id AND o.stil_id = s.stil_id AND o.status = 'odobrena') AS odobrenih,
       (SELECT group_concat(g.oznaka || ' ' || rg.pozicija, ' · ') FROM rijec_glas rg JOIN glasovi g ON g.id = rg.glas_id WHERE rg.rijec_id = r.id) AS pozicije
     FROM slike s JOIN rijeci r ON r.id = s.rijec_id
     WHERE s.status = 'kandidat' AND r.aktivna = 1 AND (?3 = 0 OR s.predlozio IS NULL)
       AND (?1 IS NULL OR EXISTS (SELECT 1 FROM rijec_glas rg JOIN glasovi g ON g.id = rg.glas_id WHERE rg.rijec_id = r.id AND g.slug = ?1)))
     WHERE ?2 IS NULL OR zatrazio = ?2
     ORDER BY predlozio IS NULL, id LIMIT 200`,
  ).bind(glas, vidi, logoped ? 1 : 0).all<Kandidat>();
  return results;
}

/**
 * Odluke zadnjih 30 min: da pregled može reći tko je bio brži. `vidi` kao u `kandidati`; logoped
 * (`logoped`) dobiva samo odluke o svojim slikama i bez tuđeg e-maila (revizija 18. 11. 2026.).
 */
export async function nedavneOdluke(vidi: string | null = null, logoped = false): Promise<{ id: number; status: string; pregledao: string | null }[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, status, pregledao FROM (SELECT s.id, s.status, lower(s.pregledao) AS pregledao, ${ZATRAZIO_SLIKE} AS zatrazio FROM slike s
       WHERE s.status != 'kandidat' AND s.pregledano_at > datetime('now', '-30 minutes'))
     WHERE ?1 IS NULL OR zatrazio = ?1`,
  ).bind(vidi).all<{ id: number; status: string; pregledao: string | null }>();
  return logoped ? results.map((o) => ({ ...o, pregledao: o.pregledao === vidi ? o.pregledao : null })) : results;
}

/** Broj kandidata za pregled (svi stilovi), uz isti filtar kao `kandidati`: gumb „Pregledaj N” na Katalogu. */
export async function brojKandidata(vidi: string | null, logoped = false): Promise<number> {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM slike s JOIN rijeci r ON r.id = s.rijec_id
     WHERE s.status = 'kandidat' AND r.aktivna = 1 AND (?1 IS NULL OR ${ZATRAZIO_SLIKE} = ?1) AND (?2 = 0 OR s.predlozio IS NULL)`,
  ).bind(vidi, logoped ? 1 : 0).first<{ n: number }>();
  return r?.n ?? 0;
}
