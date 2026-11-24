// Zahtjevi za pristup s /pristup (S7 landinga), za superadmina na /admin/zahtjevi. „Odobri” izdaje običnu
// pozivnicu (pozivi.ts izdaj()); link se prikaže samo u tom odgovoru, u bazi ostaje samo njegov sha-256
// (`poziv_token_hash`, po njemu retencija zna kad je pozivnica iskorištena). Zahtjevi nisu u `aktivnost`
// (CHECK na `tablica`), trag je `obradio`/`obradjen_at`; izdaj() sam upiše 'poziv.izdan'.
import { env } from "cloudflare:workers";
import { PozivOdbijen, izdaj, type RazlogOdbijanja } from "./pozivi";
import { sha256Hex } from "./sesija";
import { dodijeli, type Pogodnost } from "./pogodnosti";

export type StatusZahtjeva = "novi" | "odobren" | "odbijen";

export interface Zahtjev {
  id: number; ime: string; email: string; ustanova: string | null; grad: string | null; poruka: string | null;
  created_at: string; status: StatusZahtjeva; obradio: string | null; obradjen_at: string | null;
  /** Odluka 816: 'beta' (besplatno, odlučuje superadmin) ili naručeni paket; `broj_licenci` uz 'ustanova'. */
  paket: string; broj_licenci: number | null;
}

const STUPCI = "id, ime, email, ustanova, grad, poruka, created_at, status, obradio, obradjen_at, paket, broj_licenci";

export async function noviZahtjevi(): Promise<Zahtjev[]> {
  return (await env.DB.prepare(`SELECT ${STUPCI} FROM zahtjevi_pristupa WHERE status = 'novi' ORDER BY created_at, id`)
    .all<Zahtjev>()).results;
}

export async function obradjeniZahtjevi(koliko = 20): Promise<Zahtjev[]> {
  return (await env.DB.prepare(
    `SELECT ${STUPCI} FROM zahtjevi_pristupa WHERE status != 'novi' ORDER BY obradjen_at DESC, id DESC LIMIT ?`,
  ).bind(koliko).all<Zahtjev>()).results;
}

/** Brojač u bočnoj traci superadmina (indeks na status). */
export async function brojNovih(): Promise<number> {
  return (await env.DB.prepare("SELECT count(*) AS n FROM zahtjevi_pristupa WHERE status = 'novi'").first<number>("n")) ?? 0;
}

export type IshodOdobravanja =
  | { ok: true; token: string; email: string; ime: string; istjece: string }
  | { ok: false; razlog: "obradjen" | RazlogOdbijanja };

/**
 * Odobri zahtjev i izdaj pozivnicu. Prvo se zahtjev uvjetno preuzme (`WHERE status = 'novi'`), pa dva
 * istodobna klika ne mogu izdati dvije pozivnice: drugi dobije „obradjen”. Ako izdaj() odbije
 * (npr. aktivan_logoped) ili pukne, zahtjev se vraća u 'novi'. Uz `pogodnost` se nakon izdane pozivnice upiše i
 * pogodnost nakon bete (pogodnosti.ts).
 */
export async function odobri(
  id: number, tko: string, sada = new Date(), pogodnost: { p: Pogodnost; napomena?: string } | null = null,
): Promise<IshodOdobravanja> {
  const at = sada.toISOString();
  const z = await env.DB.prepare(
    `UPDATE zahtjevi_pristupa SET status = 'odobren', obradio = ?, obradjen_at = ?
     WHERE id = ? AND status = 'novi' RETURNING email, ime`,
  ).bind(tko, at, id).first<{ email: string; ime: string }>();
  if (!z) return { ok: false, razlog: "obradjen" };
  let p: Awaited<ReturnType<typeof izdaj>>;
  try {
    p = await izdaj({ email: z.email, ime: z.ime }, tko, sada);
  } catch (e) {
    await env.DB.prepare(
      `UPDATE zahtjevi_pristupa SET status = 'novi', obradio = NULL, obradjen_at = NULL
       WHERE id = ? AND status = 'odobren' AND poziv_token_hash IS NULL`,
    ).bind(id).run();
    if (e instanceof PozivOdbijen) return { ok: false, razlog: e.razlog };
    throw e;
  }
  await env.DB.prepare("UPDATE zahtjevi_pristupa SET poziv_token_hash = ? WHERE id = ?").bind(await sha256Hex(p.token), id).run();
  // Pogodnost nakon bete (docs/pogodnosti.md): tek kad je pozivnica izdana; bez nje se postojeća ne dira.
  if (pogodnost) await dodijeli(p.email, pogodnost.p, pogodnost.napomena, tko, sada);
  return { ok: true, token: p.token, email: p.email, ime: z.ime, istjece: p.istjece };
}

/** Odbij (ili zatvori) otvoreni zahtjev. false: nema ga ili je već obrađen. */
export async function odbij(id: number, tko: string, sada = new Date()): Promise<boolean> {
  const r = await env.DB.prepare(
    "UPDATE zahtjevi_pristupa SET status = 'odbijen', obradio = ?, obradjen_at = ? WHERE id = ? AND status = 'novi' RETURNING id",
  ).bind(tko, sada.toISOString(), id).first();
  return r !== null;
}
