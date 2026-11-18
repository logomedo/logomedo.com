// Tko je poslao sliku ili izgovor na generiranje (ili učitao sliku). Pregled i odluke idu po tome:
// logoped vidi i odlučuje samo o svojima, superadmin o svima (filtar `pregledFiltar` u
// lib/admin/vlasnistvo.ts). Bez stupca u `slike`/`zvukovi`: izvodi se iz posla i dnevnika.
import { env } from "cloudflare:workers";
import { adminEmails } from "./admin/sesija";

/** E-mail onoga tko je poslao sliku `s` (alias): posao generiranja, inače zapis učitavanja/premještanja. */
export const zatrazioSlike = (s = "s") => `lower(COALESCE(
  (SELECT g.zatrazio FROM generiranja g WHERE g.rijec_id = ${s}.rijec_id AND g.slika_id = ${s}.id ORDER BY g.id LIMIT 1),
  (SELECT a.tko FROM aktivnost a WHERE a.tablica = 'slike' AND a.redak_id = ${s}.id ORDER BY a.id LIMIT 1)))`;
export const ZATRAZIO_SLIKE = zatrazioSlike();

/** E-mail onoga tko je poslao izgovor `z` (alias) na snimanje. */
export const ZATRAZIO_ZVUKA = `lower((SELECT q.zatrazio FROM zvuk_generiranja q WHERE q.id = z.posao_id))`;

/** Smije li `email` odlučivati o slici: superadmin uvijek, ostali samo o svojoj. */
export async function smijeOSlici(slikaId: number, email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (adminEmails().has(e)) return true;
  const r = await env.DB.prepare(`SELECT ${ZATRAZIO_SLIKE} AS tko FROM slike s WHERE s.id = ?`).bind(slikaId).first<{ tko: string | null }>();
  return r?.tko === e;
}

/** Ime za prikaz po e-mailu (korisnici.ime, inače e-mail); za oznaku „poslao” kod superadmina. */
export async function imenaKorisnika(): Promise<Map<string, string>> {
  const { results } = await env.DB.prepare("SELECT lower(email) AS email, ime FROM korisnici").all<{ email: string; ime: string | null }>();
  return new Map(results.map((r) => [r.email, r.ime?.trim() || r.email]));
}

/** Korisnici koji imaju nešto na pregledu (za filtar superadmina). */
export async function posiljateljiNaPregledu(): Promise<{ email: string; ime: string; slike: number; zvukovi: number }[]> {
  const { results } = await env.DB.prepare(
    `WITH sl AS (SELECT ${ZATRAZIO_SLIKE} AS tko FROM slike s JOIN rijeci r ON r.id = s.rijec_id WHERE s.status = 'kandidat' AND r.aktivna = 1),
          zv AS (SELECT ${ZATRAZIO_ZVUKA} AS tko FROM zvukovi z WHERE z.status = 'kandidat'),
          svi AS (SELECT tko, 1 AS s, 0 AS z FROM sl UNION ALL SELECT tko, 0, 1 FROM zv)
     SELECT svi.tko AS email, COALESCE(NULLIF(trim(k.ime), ''), svi.tko) AS ime, SUM(svi.s) AS slike, SUM(svi.z) AS zvukovi
     FROM svi LEFT JOIN korisnici k ON lower(k.email) = svi.tko WHERE svi.tko IS NOT NULL GROUP BY svi.tko ORDER BY 2`,
  ).all<{ email: string; ime: string; slike: number; zvukovi: number }>();
  return results;
}

export const NIJE_TVOJA = "Ovo je poslao drugi korisnik; o tome odlučuje on ili superadmin.";
