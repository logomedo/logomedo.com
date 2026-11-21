// Istoznačnice (migracija 0042, docs/katalog.md): povezivanje riječi istog značenja u grupe.
import { env } from "cloudflare:workers";

export { jednaPoGrupi } from "./istoznacnice-cisto";

export interface Istoznacnica { id: number; rijec: string; slug: string }

/** Ostale riječi iz grupe riječi `id` (aktivne). */
export async function istoznacniceRijeci(id: number): Promise<Istoznacnica[]> {
  return (await env.DB.prepare(
    `SELECT r.id, r.rijec, r.slug FROM istoznacnice i JOIN rijeci r ON r.id = i.rijec_id
     WHERE i.grupa = (SELECT grupa FROM istoznacnice WHERE rijec_id = ?1) AND r.id != ?1 AND r.aktivna = 1
     ORDER BY r.rijec COLLATE NOCASE`,
  ).bind(id).all<Istoznacnica>()).results;
}

const grupaOd = async (id: number) =>
  (await env.DB.prepare("SELECT grupa FROM istoznacnice WHERE rijec_id = ?").bind(id).first<{ grupa: number }>())?.grupa ?? null;

/** Povezuje dvije riječi; ako su obje već u (različitim) grupama, grupe se spajaju. */
export async function povezi(a: number, b: number, email: string): Promise<void> {
  if (a === b) return;
  const [ga, gb] = [await grupaOd(a), await grupaOd(b)];
  const db = env.DB;
  const dodaj = (id: number, g: number) => db.prepare("INSERT INTO istoznacnice (rijec_id, grupa, dodao) VALUES (?, ?, ?)").bind(id, g, email);
  if (ga === null && gb === null) { const g = Math.min(a, b); await db.batch([dodaj(a, g), dodaj(b, g)]); }
  else if (ga === null) await dodaj(a, gb!).run();
  else if (gb === null) await dodaj(b, ga).run();
  else if (ga !== gb) await db.prepare("UPDATE istoznacnice SET grupa = ? WHERE grupa = ?").bind(Math.min(ga, gb), Math.max(ga, gb)).run();
}

/** Miče riječ iz njezine grupe; grupa koja ostane s jednom riječi se briše. */
export async function odvezi(id: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM istoznacnice WHERE rijec_id = ?").bind(id),
    env.DB.prepare("DELETE FROM istoznacnice WHERE grupa IN (SELECT grupa FROM istoznacnice GROUP BY grupa HAVING COUNT(*) = 1)"),
  ]);
}
