// Pregled Uprave (/admin/uprava, docs/uprava/plan.md): brojevi za kartice, jednim upitom. Samo čitanje.
import { env } from "cloudflare:workers";

export type PregledUprave = {
  zahtjeva: number;
  neprocitanih: number;
  logopeda: number;
  neaktivnih: number;
  pozivnica: number;
  pogodnosti: number;
  kupona: number;
  /** null kad naplata na ovoj okolini nije uključena (tablicu se tada ne čita). */
  uplate: { broj: number; centi: number; neposlanih: number } | null;
};

/** `od` je početak tekućeg mjeseca (ISO), za uplate „ovaj mjesec”. */
export async function pregledUprave(sada: Date, naplata: boolean): Promise<PregledUprave> {
  const at = sada.toISOString();
  const od = new Date(Date.UTC(sada.getUTCFullYear(), sada.getUTCMonth(), 1)).toISOString();
  const r = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM zahtjevi_pristupa WHERE status = 'novi') AS zahtjeva,
       (SELECT COALESCE(SUM(neprocitano), 0) FROM razgovori WHERE neprocitano > 0) AS neprocitanih,
       (SELECT COUNT(*) FROM korisnici WHERE uloga = 'logoped' AND aktivan = 1) AS logopeda,
       (SELECT COUNT(*) FROM korisnici WHERE uloga = 'logoped' AND aktivan = 0) AS neaktivnih,
       (SELECT COUNT(*) FROM pozivi WHERE iskoristena_at IS NULL AND opozvana_at IS NULL AND istjece > ?1) AS pozivnica,
       (SELECT COUNT(*) FROM pogodnosti WHERE opozvana_at IS NULL) AS pogodnosti,
       (SELECT COUNT(*) FROM kuponi WHERE aktivan = 1 AND (vrijedi_do IS NULL OR vrijedi_do > ?1)) AS kupona`,
  ).bind(at).first<Omit<PregledUprave, "uplate">>();
  const uplate = naplata
    ? await env.DB.prepare(
      `SELECT COUNT(*) AS broj, COALESCE(SUM(iznos_centi), 0) AS centi,
         (SELECT COUNT(*) FROM uplate WHERE racun_status <> 'poslan') AS neposlanih
       FROM uplate WHERE placeno_at >= ?`,
    ).bind(od).first<{ broj: number; centi: number; neposlanih: number }>()
    : null;
  return {
    zahtjeva: 0, neprocitanih: 0, logopeda: 0, neaktivnih: 0, pozivnica: 0, pogodnosti: 0, kupona: 0,
    ...r, uplate: uplate ?? null,
  };
}
