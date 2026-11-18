// Nepoželjne riječi (migracija 0036, docs/katalog.md): riječi koje ne želimo u katalogu, s razlogom.
// Nova riječ ih odbija, a popis prijedloga ih preskače.
import { env } from "cloudflare:workers";
import { adminEmails } from "./admin/sesija";
import { normalizirajRijec } from "./nepozeljne-cisto";

export { normalizirajRijec };
export interface Nepozeljna { id: number; rijec: string; razlog: string | null; dodao: string | null; created_at: string }

export async function nepozeljna(rijec: string): Promise<Nepozeljna | null> {
  return env.DB.prepare("SELECT * FROM nepozeljne_rijeci WHERE rijec = ?").bind(normalizirajRijec(rijec)).first<Nepozeljna>();
}

export async function sveNepozeljne(): Promise<Nepozeljna[]> {
  return (await env.DB.prepare("SELECT * FROM nepozeljne_rijeci ORDER BY rijec COLLATE NOCASE").all<Nepozeljna>()).results;
}

/** Dodaje riječ ili joj mijenja razlog. Prazna riječ: null. */
export async function dodajNepozeljnu(rijec: string, razlog: string | null, email: string): Promise<string | null> {
  const r = normalizirajRijec(rijec);
  if (!r) return null;
  await env.DB.prepare(
    `INSERT INTO nepozeljne_rijeci (rijec, razlog, dodao) VALUES (?, ?, ?)
     ON CONFLICT(rijec) DO UPDATE SET razlog = COALESCE(excluded.razlog, nepozeljne_rijeci.razlog)`,
  ).bind(r, razlog?.trim().slice(0, 500) || null, email).run();
  return r;
}

export async function makniNepozeljnu(id: number): Promise<void> {
  await env.DB.prepare("DELETE FROM nepozeljne_rijeci WHERE id = ?").bind(id).run();
}

/**
 * Smije li `email` dodati riječ `rijec` (forma, editor zadatka, premještanje slike na novu riječ).
 * Nepoželjna ne smije nitko; obrisanu (neaktivnu) riječ vraća samo superadmin, jer bi joj logoped
 * poništio brisanje (revizija 18. 11. 2026., ODLUKA 1). Vraća poruku zabrane ili null.
 */
export async function zabranaNoveRijeci(rijec: string, email: string): Promise<string | null> {
  const r = normalizirajRijec(rijec);
  const ne = await nepozeljna(r);
  if (ne) return `„${r}” je na popisu nepoželjnih riječi${ne.razlog ? `: ${ne.razlog}` : ""}.`;
  if (adminEmails().has(email.trim().toLowerCase())) return null;
  const obrisana = await env.DB.prepare("SELECT 1 FROM rijeci WHERE rijec = ? AND aktivna = 0").bind(r).first();
  return obrisana ? `„${r}” je obrisana iz kataloga; vratiti je može samo superadmin.` : null;
}
