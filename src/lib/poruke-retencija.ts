// Retencija inboxa (docs/inbox/, S4, odluka 400): razgovor s porukama i privitcima briše se PORUKE_ROK_MJESECI
// nakon zadnje poruke (isti broj kao /privatnost#dopisivanje), a razgovor bez ijedne poruke (pozivnica koja nije
// otišla, a brisanje nije uspjelo) nakon jednog dana. Pokreće se pri otvaranju /admin/poruke, kao `pocisti()` u
// src/lib/pristup.ts: bez crona, a dok nitko ne otvara inbox, nitko ni ne čita stare poruke.
//
// Redoslijed: prvo objekti u R2, pa D1. Ako R2 padne, D1 ostaje netaknut i sljedeće otvaranje pokuša ponovno;
// obrnuto bi ostali objekti bez retka koje više nitko ne bi našao.
import { env } from "cloudflare:workers";
import { PORUKE_ROK_MJESECI } from "./poruke-rokovi";

const db = () => env.DB as D1Database;

/** Prazan razgovor (bez poruka) stariji od ovoga je ostatak neuspjelog slanja. */
export const PRAZAN_SATI = 24;
/** Najviše razgovora po jednom čišćenju (ostatak ide pri sljedećem otvaranju); R2 `delete` prima do 1000 ključeva. */
export const NAJVISE_PO_CISCENJU = 200;

const prije = (sada: Date, mjeseci: number) => {
  const d = new Date(sada);
  d.setUTCMonth(d.getUTCMonth() - mjeseci);
  return d.toISOString();
};

export interface IshodCiscenja { razgovori: number; r2: number }

/** Obriši istekle razgovore (poruke, privitke u R2 i D1, red obavijesti) i stare prazne razgovore. */
export async function pocistiPoruke(sada = new Date()): Promise<IshodCiscenja> {
  const granica = prije(sada, PORUKE_ROK_MJESECI);
  const prazanGranica = new Date(sada.getTime() - PRAZAN_SATI * 3600_000).toISOString();
  const { results } = await db().prepare(
    `SELECT id FROM razgovori r
      WHERE zadnja_at < ?1
         OR (created_at < ?2 AND NOT EXISTS (SELECT 1 FROM poruke p WHERE p.razgovor_id = r.id))
      ORDER BY zadnja_at LIMIT ?3`,
  ).bind(granica, prazanGranica, NAJVISE_PO_CISCENJU).all<{ id: number }>();
  const ids = results.map((r) => r.id);
  if (!ids.length) return { razgovori: 0, r2: 0 };

  const lista = ids.join(","); // samo cijeli brojevi iz baze
  const kljucevi = (await db().prepare(
    `SELECT pr.r2_kljuc AS k FROM privitci pr JOIN poruke p ON p.id = pr.poruka_id
      WHERE p.razgovor_id IN (${lista}) AND pr.r2_kljuc IS NOT NULL`,
  ).all<{ k: string }>()).results.map((r) => r.k);
  for (let i = 0; i < kljucevi.length; i += 1000) await env.SLIKE.delete(kljucevi.slice(i, i + 1000));

  // Eksplicitno po tablicama: ne oslanja se na ON DELETE CASCADE (foreign_keys pragma).
  await db().batch([
    db().prepare(`DELETE FROM privitci WHERE poruka_id IN (SELECT id FROM poruke WHERE razgovor_id IN (${lista}))`),
    db().prepare(`DELETE FROM poruke WHERE razgovor_id IN (${lista})`),
    db().prepare(`DELETE FROM obavijesti WHERE kljuc IN (${ids.map((id) => `'razgovor:${id}'`).join(",")})`),
    db().prepare(`DELETE FROM razgovori WHERE id IN (${lista})`),
  ]);
  return { razgovori: ids.length, r2: kljucevi.length };
}
