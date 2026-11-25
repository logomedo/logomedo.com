// Kuponi na /pristup (migrations/0047, docs/kuponi.md). Superadmin ih stvara na /admin/kuponi; osoba upiše kod u
// obrazac ili dobije link /pristup?kupon=KOD. Kupon s `auto_odobri` odobrava zahtjev sam (pristup.ts posalji()):
// pozivnica odmah ide e-poštom, bez klika „Odobri”. Uz kupon može ići pogodnost nakon bete (pogodnosti.ts).
import { env } from "cloudflare:workers";
import { MJESECI_MAX, type Pogodnost } from "./pogodnosti";

export interface Kupon {
  id: number; kod: string; opis: string | null; auto_odobri: number; vrsta: Pogodnost["vrsta"] | null; mjeseci: number | null;
  max_koristenja: number | null; iskoristen: number; vrijedi_do: string | null; aktivan: number; stvorio: string; created_at: string;
}

export const KOD = /^[A-Z0-9-]{4,32}$/;
export const OPIS_MAX = 200;
export const KORISTENJA_MAX = 10_000;

/** Kod iz unosa: velika slova, bez razmaka; ne provjerava oblik (za to `KOD`). Hrvatska slova ostaju, pa ne prolaze. */
export const normalizirajKod = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, "").toUpperCase().slice(0, 64) : "");

export const pogodnostKupona = (k: Pick<Kupon, "vrsta" | "mjeseci">): Pogodnost | null =>
  k.vrsta === "trajno" ? { vrsta: "trajno", mjeseci: null } : k.vrsta === "mjeseci" && k.mjeseci ? { vrsta: "mjeseci", mjeseci: k.mjeseci } : null;

export const linkKupona = (origin: string, kod: string) => `${origin}/pristup?kupon=${encodeURIComponent(kod)}`;

/** Vrijedi li kupon sada (aktivan, nije istekao, ima još korištenja). */
export const vrijedi = (k: Kupon, sada = new Date()) =>
  k.aktivan === 1 && (k.vrijedi_do === null || k.vrijedi_do > sada.toISOString())
  && (k.max_koristenja === null || k.iskoristen < k.max_koristenja);

export interface NoviKupon {
  kod: unknown; opis?: unknown; autoOdobri: boolean; pogodnost: Pogodnost | null;
  maxKoristenja?: unknown; vrijediDo?: unknown;
}

export type IshodKupona = { ok: true; kod: string } | { ok: false; greska: string };

/** Stvori kupon. `vrijediDo`: "YYYY-MM-DD" (vrijedi do kraja tog dana, UTC) ili prazno. */
export async function stvori(n: NoviKupon, tko: string, sada = new Date()): Promise<IshodKupona> {
  const kod = normalizirajKod(n.kod);
  if (!KOD.test(kod)) return { ok: false, greska: "Kod: 4 do 32 znaka, samo slova A–Z, brojke i crtica." };
  const opis = (typeof n.opis === "string" ? n.opis.trim().slice(0, OPIS_MAX) : "") || null;
  const maxS = typeof n.maxKoristenja === "string" ? n.maxKoristenja.trim() : "";
  const max = maxS === "" ? null : Number(maxS);
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > KORISTENJA_MAX)) return { ok: false, greska: `Broj korištenja: 1 do ${KORISTENJA_MAX} ili prazno.` };
  const doS = typeof n.vrijediDo === "string" ? n.vrijediDo.trim() : "";
  let vrijediDo: string | null = null;
  if (doS) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(doS) || Number.isNaN(Date.parse(`${doS}T23:59:59.999Z`))) return { ok: false, greska: "Neispravan datum." };
    vrijediDo = `${doS}T23:59:59.999Z`;
    if (vrijediDo <= sada.toISOString()) return { ok: false, greska: "Datum isteka je već prošao." };
  }
  const p = n.pogodnost;
  if (p?.vrsta === "mjeseci" && !(p.mjeseci >= 1 && p.mjeseci <= MJESECI_MAX)) return { ok: false, greska: "Nepoznata pogodnost." };
  const r = await env.DB.prepare(
    `INSERT INTO kuponi (kod, opis, auto_odobri, vrsta, mjeseci, max_koristenja, vrijedi_do, stvorio, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (kod) DO NOTHING`,
  ).bind(kod, opis, n.autoOdobri ? 1 : 0, p?.vrsta ?? null, p?.mjeseci ?? null, max, vrijediDo, tko, sada.toISOString()).run();
  if (!r.meta.changes) return { ok: false, greska: `Kupon ${kod} već postoji.` };
  return { ok: true, kod };
}

/** Uključi ili isključi kupon. false: nema ga. */
export async function postaviAktivan(id: number, aktivan: boolean): Promise<boolean> {
  const r = await env.DB.prepare("UPDATE kuponi SET aktivan = ? WHERE id = ?").bind(aktivan ? 1 : 0, id).run();
  return r.meta.changes > 0;
}

export async function svi(): Promise<Kupon[]> {
  return (await env.DB.prepare("SELECT * FROM kuponi ORDER BY aktivan DESC, created_at DESC, id DESC").all<Kupon>()).results;
}

export async function poKodu(kodUnos: unknown): Promise<Kupon | null> {
  const kod = normalizirajKod(kodUnos);
  return KOD.test(kod) ? env.DB.prepare("SELECT * FROM kuponi WHERE kod = ?").bind(kod).first<Kupon>() : null;
}

/**
 * Atomski zauzmi jedno korištenje kupona za auto-odobravanje. null: kupon ne postoji, nije auto, isključen,
 * istekao ili potrošen. Dva istodobna obrasca ne mogu prijeći `max_koristenja` (uvjet je u istom UPDATE-u).
 */
export async function zauzmi(kodUnos: unknown, sada = new Date()): Promise<Kupon | null> {
  const kod = normalizirajKod(kodUnos);
  if (!KOD.test(kod)) return null;
  return env.DB.prepare(
    `UPDATE kuponi SET iskoristen = iskoristen + 1
     WHERE kod = ? AND aktivan = 1 AND auto_odobri = 1 AND (vrijedi_do IS NULL OR vrijedi_do > ?)
       AND (max_koristenja IS NULL OR iskoristen < max_koristenja)
     RETURNING *`,
  ).bind(kod, sada.toISOString()).first<Kupon>();
}

/** Vrati zauzeto korištenje (odobravanje ili slanje pozivnice nije uspjelo). */
export async function oslobodi(kod: string): Promise<void> {
  await env.DB.prepare("UPDATE kuponi SET iskoristen = iskoristen - 1 WHERE kod = ? AND iskoristen > 0").bind(kod).run();
}
