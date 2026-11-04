// Dnevnik aktivnosti (docs/aktivnost.md). Svaka izmjena kataloga ide u isti `db.batch()` kao i
// zapis o njoj: snimak retka prije, izmjena, snimak poslije. Batch je jedna transakcija, pa nema
// izmjene bez zapisa ni zapisa bez izmjene; zapis u kojem se ništa nije promijenilo se briše.
// „Poništi” (stanje prije) i „Vrati na ovo” (stanje poslije) samo primijene snimak kao novu
// izmjenu s novim zapisom: povijest se nikad ne briše ni ne prepisuje.
import { env } from "cloudflare:workers";
import { uskladiJavno } from "./generiranje";
import { zazvoni } from "./runner-zvono";
import type { StavkaPrikaz } from "./aktivnost-prikaz";

export type Tablica = "rijeci" | "slike" | "generiranja" | "biljeznice";

/**
 * JSON snimak retka kao izraz nad aliasom `x`. Samo ono što admin mijenja: bez vremena i
 * brojača koje mijenja runner, da isto stanje uvijek da isti tekst (tako se prepoznaje zapis bez promjene).
 */
const SNIMAK: Record<Tablica, string> = {
  rijeci: `json_object('rijec', x.rijec, 'slug', x.slug, 'opis_za_sliku', x.opis_za_sliku, 'recenica', x.recenica, 'rima', x.rima,
    'aktivna', x.aktivna, 'glasovi', (SELECT json_group_array(json_object('glas', gl.oznaka, 'glas_id', rg.glas_id, 'pozicija', rg.pozicija,
      'potvrdeno', rg.potvrdeno) ORDER BY rg.glas_id, rg.pozicija) FROM rijec_glas rg JOIN glasovi gl ON gl.id = rg.glas_id WHERE rg.rijec_id = x.id))`,
  slike: `json_object('rijec_id', x.rijec_id, 'stil_id', x.stil_id, 'status', x.status, 'razlog', x.razlog,
    'pregledao', x.pregledao, 'pregledano_at', x.pregledano_at)`,
  generiranja: `json_object('rijec_id', x.rijec_id, 'stil_id', x.stil_id, 'prompt', x.prompt, 'status', x.status)`,
  biljeznice: `json_object('naslov', x.naslov, 'podnaslov', x.podnaslov, 'slug', x.slug, 'javna', x.javna, 'tema', x.tema,
    'zadaci', (SELECT json_group_array(bz.zadatak_id ORDER BY bz.redoslijed) FROM biljeznica_zadaci bz WHERE bz.biljeznica_id = x.id))`,
};

/** SQL koji daje id retka (`?` ili podupit) s parametrima. Podupit služi za retke koji tek nastaju. */
export interface Kljuc { sql: string; args: unknown[] }
const poId = (id: number): Kljuc => ({ sql: "?", args: [id] });
const snimak = (t: Tablica, k: Kljuc): Kljuc => ({ sql: `(SELECT ${SNIMAK[t]} FROM ${t} x WHERE x.id = (${k.sql}))`, args: k.args });

export interface Zapis { tko: string; radnja: string; tablica: Tablica; grupa: string; vracaId?: number | null }

/** Nova grupa: jedna radnja korisnika, koja se poništava zajedno. */
export const novaGrupa = () => crypto.randomUUID();

/**
 * Izmjena jednog retka sa zapisom. Rezultat i-te izmjene je na indeksu `1 + i` rezultata batcha.
 * `kljuc` je id ili podupit (novi redak: prije je NULL, id se upiše nakon izmjene).
 */
export function sZapisom(z: Zapis, kljuc: number | Kljuc, izmjene: D1PreparedStatement[]): D1PreparedStatement[] {
  const db = env.DB;
  const k = typeof kljuc === "number" ? poId(kljuc) : kljuc;
  const s = snimak(z.tablica, k);
  return [
    db.prepare(`INSERT INTO aktivnost (tko, radnja, tablica, grupa, vraca_id, redak_id, prije) VALUES (?, ?, ?, ?, ?, (${k.sql}), ${s.sql})`)
      .bind(z.tko, z.radnja, z.tablica, z.grupa, z.vracaId ?? null, ...k.args, ...s.args),
    ...izmjene,
    // Unutar transakcije je zadnji redak dnevnika upravo ovaj.
    db.prepare(`UPDATE aktivnost SET redak_id = COALESCE(redak_id, (${k.sql})), poslije = ${s.sql} WHERE id = (SELECT MAX(id) FROM aktivnost)`)
      .bind(...k.args, ...s.args),
    db.prepare("DELETE FROM aktivnost WHERE id = (SELECT MAX(id) FROM aktivnost) AND (prije IS poslije OR redak_id IS NULL)"),
  ];
}

/**
 * Izmjena skupa postojećih redaka (`gdje` nad aliasom `x`, prije izmjene) sa zapisom po retku,
 * u tri naredbe bez obzira na broj redaka (red generiranja: stotine poslova).
 * Unutar jedne grupe `radnja` mora biti jedinstvena: po njoj se nalaze ovi zapisi.
 */
export function zapisSkupa(z: Zapis, gdje: Kljuc, izmjene: D1PreparedStatement[]): D1PreparedStatement[] {
  const db = env.DB;
  return [
    db.prepare(
      `INSERT INTO aktivnost (tko, radnja, tablica, grupa, vraca_id, redak_id, prije)
       SELECT ?, ?, ?, ?, ?, x.id, ${SNIMAK[z.tablica]} FROM ${z.tablica} x WHERE ${gdje.sql}`,
    ).bind(z.tko, z.radnja, z.tablica, z.grupa, z.vracaId ?? null, ...gdje.args),
    ...izmjene,
    db.prepare(
      `UPDATE aktivnost SET poslije = (SELECT ${SNIMAK[z.tablica]} FROM ${z.tablica} x WHERE x.id = aktivnost.redak_id)
       WHERE grupa = ? AND radnja = ?`,
    ).bind(z.grupa, z.radnja),
    db.prepare("DELETE FROM aktivnost WHERE grupa = ? AND radnja = ? AND prije IS poslije").bind(z.grupa, z.radnja),
  ];
}

/** Zapisi za retke koji su upravo nastali (`gdje` nad aliasom `x`, poslije upisa). Jedna naredba. */
export function zapisNastalih(z: Zapis, gdje: Kljuc): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO aktivnost (tko, radnja, tablica, grupa, vraca_id, redak_id, prije, poslije)
     SELECT ?, ?, ?, ?, ?, x.id, NULL, ${SNIMAK[z.tablica]} FROM ${z.tablica} x WHERE ${gdje.sql}`,
  ).bind(z.tko, z.radnja, z.tablica, z.grupa, z.vracaId ?? null, ...gdje.args);
}

// ---- Čitanje ----

export type Stavka = StavkaPrikaz;

export interface Filtar { nakon?: number; prije?: number; tko?: string; rijecId?: number; grupa?: string; limit?: number }

/** Najnovije prvo. `nakon` za osvježavanje uživo, `prije` za starije stranice. */
export async function popis(f: Filtar = {}): Promise<Stavka[]> {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.at, a.tko, a.radnja, a.tablica, a.redak_id, a.grupa, a.prije, a.poslije, a.vraca_id, a.rijec_id,
       r.rijec, r.slug, st.naziv AS stil, b.naslov AS biljeznica, v.radnja AS vraca_radnja,
       EXISTS (SELECT 1 FROM aktivnost l WHERE l.tablica = a.tablica AND l.redak_id = a.redak_id AND l.id > a.id) AS kasnije,
       (SELECT COUNT(*) FROM aktivnost g WHERE g.grupa = a.grupa) AS u_grupi
     FROM aktivnost a
     LEFT JOIN rijeci r ON r.id = a.rijec_id
     LEFT JOIN stilovi st ON a.tablica IN ('slike', 'generiranja') AND st.id = json_extract(COALESCE(a.poslije, a.prije), '$.stil_id')
     LEFT JOIN biljeznice b ON a.tablica = 'biljeznice' AND b.id = a.redak_id
     LEFT JOIN aktivnost v ON v.id = a.vraca_id
     WHERE (?1 IS NULL OR a.id > ?1) AND (?2 IS NULL OR a.id < ?2) AND (?3 IS NULL OR a.tko = ?3)
       AND (?4 IS NULL OR a.rijec_id = ?4) AND (?5 IS NULL OR a.grupa = ?5)
     ORDER BY a.id DESC LIMIT ?6`,
  ).bind(f.nakon ?? null, f.prije ?? null, f.tko ?? null, f.rijecId ?? null, f.grupa ?? null, Math.min(f.limit ?? 100, 300)).all<Stavka>();
  return results;
}

/** Tko je sve nešto mijenjao (filtar u dnevniku). */
export async function autori(): Promise<string[]> {
  return (await env.DB.prepare("SELECT DISTINCT tko FROM aktivnost ORDER BY tko").all<{ tko: string }>()).results.map((r) => r.tko);
}

// ---- Vraćanje ----

type Redak = { id: number; tablica: Tablica; redak_id: number; prije: string | null; poslije: string | null };
export type Smjer = "ponisti" | "vrati";
type Snimak = Record<string, unknown>;

/**
 * Primijeni snimak cijele grupe zapisa: `ponisti` = stanje prije (od zadnjeg prema prvom),
 * `vrati` = stanje poslije (redom). Sve u jednoj transakciji; nastaje nova grupa zapisa.
 */
export async function vrati(zapisId: number, smjer: Smjer, tko: string): Promise<{ ok: true; promjena: number; grupa: string } | { ok: false; greska: string }> {
  const db = env.DB;
  const izvor = await db.prepare("SELECT grupa FROM aktivnost WHERE id = ?").bind(zapisId).first<{ grupa: string }>();
  if (!izvor) return { ok: false, greska: "Nema tog zapisa." };
  const { results: redovi } = await db.prepare(
    `SELECT id, tablica, redak_id, prije, poslije FROM aktivnost WHERE grupa = ? ORDER BY id ${smjer === "ponisti" ? "DESC" : "ASC"}`,
  ).bind(izvor.grupa).all<Redak>();

  const grupa = novaGrupa();
  const z = (tablica: Tablica, radnja: string): Zapis => ({ tko, radnja, tablica, grupa, vracaId: zapisId });
  const cilj = (r: Redak) => { const t = smjer === "ponisti" ? r.prije : r.poslije; return t ? (JSON.parse(t) as Snimak) : null; };
  const radnja = smjer === "ponisti" ? "ponisteno" : "vraceno";

  const naredbe: D1PreparedStatement[] = [];
  const slike: number[] = [];
  for (const r of redovi.filter((r) => r.tablica !== "generiranja")) {
    const s = cilj(r);
    if (r.tablica === "slike") {
      slike.push(r.redak_id);
      const status = (s?.status as string | undefined) ?? "odbijena";
      const razlog = s ? ((s.razlog as string | null) ?? null) : "poništeno";
      naredbe.push(...sZapisom(z("slike", radnja), r.redak_id, [
        db.prepare(
          `UPDATE slike SET status = ?1, razlog = ?2, pregledao = ?3, pregledano_at = datetime('now')
           WHERE id = ?4 AND (status IS NOT ?1 OR razlog IS NOT ?2)`,
        ).bind(status, razlog, tko, r.redak_id),
      ]));
    } else if (r.tablica === "rijeci") {
      naredbe.push(...sZapisom(z("rijeci", radnja), r.redak_id, s
        ? [
          db.prepare(
            `UPDATE rijeci SET rijec = json_extract(?1, '$.rijec'), slug = json_extract(?1, '$.slug'), opis_za_sliku = json_extract(?1, '$.opis_za_sliku'),
               recenica = json_extract(?1, '$.recenica'), rima = json_extract(?1, '$.rima'), aktivna = json_extract(?1, '$.aktivna') WHERE id = ?2`,
          ).bind(JSON.stringify(s), r.redak_id),
          db.prepare("DELETE FROM rijec_glas WHERE rijec_id = ?").bind(r.redak_id),
          db.prepare(
            `INSERT INTO rijec_glas (rijec_id, glas_id, pozicija, potvrdeno)
             SELECT ?1, json_extract(value, '$.glas_id'), json_extract(value, '$.pozicija'), json_extract(value, '$.potvrdeno') FROM json_each(?2, '$.glasovi')`,
          ).bind(r.redak_id, JSON.stringify(s)),
        ]
        // Riječ je u ovoj grupi nastala: poništavanje je samo skriva (slike i zadaci ostaju vezani uz nju).
        : [db.prepare("UPDATE rijeci SET aktivna = 0 WHERE id = ?").bind(r.redak_id)]));
    } else if (r.tablica === "biljeznice") {
      if (!s) continue;
      naredbe.push(...sZapisom(z("biljeznice", radnja), r.redak_id, [
        db.prepare(
          `UPDATE biljeznice SET naslov = json_extract(?1, '$.naslov'), podnaslov = json_extract(?1, '$.podnaslov'), slug = json_extract(?1, '$.slug'),
             javna = json_extract(?1, '$.javna'), tema = COALESCE(json_extract(?1, '$.tema'), tema), updated_at = datetime('now') WHERE id = ?2`,
        ).bind(JSON.stringify(s), r.redak_id),
        db.prepare("DELETE FROM biljeznica_zadaci WHERE biljeznica_id = ?").bind(r.redak_id),
        db.prepare(
          `INSERT OR IGNORE INTO biljeznica_zadaci (biljeznica_id, zadatak_id, redoslijed)
           SELECT ?1, value, key FROM json_each(?2, '$.zadaci') WHERE value IN (SELECT id FROM zadaci)`,
        ).bind(r.redak_id, JSON.stringify(s)),
      ]));
    }
  }

  // Poslovi u redu skupno (grupa „zatraženo generiranje” zna imati stotine redaka).
  const poslovi = redovi.filter((r) => r.tablica === "generiranja");
  const makni = poslovi.filter((r) => !cilj(r)).map((r) => r.redak_id);
  const vratiURed = poslovi.filter((r) => cilj(r)).map((r) => r.id);
  if (makni.length) {
    naredbe.push(...zapisSkupa(z("generiranja", "generiranje.uklonjeno"),
      { sql: "x.status = 'ceka' AND x.id IN (SELECT value FROM json_each(?))", args: [JSON.stringify(makni)] },
      [db.prepare("DELETE FROM generiranja WHERE status = 'ceka' AND id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(makni))]));
  }
  if (vratiURed.length) {
    const stupac = smjer === "ponisti" ? "prije" : "poslije";
    const najvisi = (await db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM generiranja").first<{ n: number }>())!.n;
    naredbe.push(
      db.prepare(
        `INSERT INTO generiranja (rijec_id, stil_id, prompt, zatrazio, predlozak_verzija)
         SELECT json_extract(a.${stupac}, '$.rijec_id'), json_extract(a.${stupac}, '$.stil_id'), json_extract(a.${stupac}, '$.prompt'), ?1,
           json_extract(a.${stupac}, '$.predlozak_verzija')
         FROM aktivnost a WHERE a.id IN (SELECT value FROM json_each(?2))
           AND NOT EXISTS (SELECT 1 FROM generiranja q WHERE q.rijec_id = json_extract(a.${stupac}, '$.rijec_id')
             AND q.stil_id = json_extract(a.${stupac}, '$.stil_id') AND q.status IN ('ceka', 'radi'))`,
      ).bind(tko, JSON.stringify(vratiURed)),
      zapisNastalih(z("generiranja", "generiranje.zatrazeno"), { sql: "x.id > ? AND x.zatrazio = ? AND x.status = 'ceka'", args: [najvisi, tko] }),
    );
  }

  if (!naredbe.length) return { ok: false, greska: "Ovdje se nema što vratiti." };
  try {
    await db.batch(naredbe);
  } catch (e) {
    const poruka = String((e as Error).message ?? e);
    if (/UNIQUE/i.test(poruka)) return { ok: false, greska: "Ne može: riječ ili adresa s tim imenom već postoji (možda je u međuvremenu dodana)." };
    throw e;
  }
  if (slike.length) await uskladiJavno([...new Set(slike)]);
  if (vratiURed.length) await zazvoni();
  const n = await db.prepare("SELECT COUNT(*) AS n FROM aktivnost WHERE grupa = ?").bind(grupa).first<{ n: number }>();
  return { ok: true, promjena: n?.n ?? 0, grupa };
}
