// /admin/korisnici (docs/rbac/, S2): popis, (de)aktivacija i AI limiti logopeda. Samo superadmin
// (ovlast `korisnici`), provjera je na stranici. Superadmin (ADMIN_EMAILS) se ovdje ne mijenja
// (odluke 2 i 106): ni deaktivacija ni limiti, jer se njegov redak za ulogu ne čita.
import { env } from "cloudflare:workers";
import { adminEmails } from "./sesija";
import { odrediUlogu, type Uloga } from "./ovlasti";
import { novaGrupa, sZapisom, zapisSkupa, type Zapis } from "../aktivnost";

/** Gornja granica limita: zaštita od tipfelera, ne poslovno pravilo. */
export const LIMIT_MAX = 100_000;

export interface KorisnikPrikaz {
  /** null: superadmin iz ADMIN_EMAILS koji još nema redak. */
  id: number | null;
  email: string;
  ime: string | null;
  /** Stvarna uloga (odluka 2); null = nema pristup (deaktiviran, ili redak 'admin' izvan ADMIN_EMAILS). */
  uloga: Uloga | null;
  ulogaRetka: string | null;
  aktivan: number;
  deaktiviran_at: string | null;
  limit_slike_7d: number | null;
  limit_zvukovi_7d: number | null;
  /** Istovremeni uređaji (lib/admin/uredaji.ts); null = zadano. */
  limit_uredaja: number | null;
  kljuceva: number;
  /** Najnovije od: početak sesije, zadnja upotreba passkeya (sesije se brišu nakon isteka). */
  zadnja_prijava: string | null;
  doprinos: Doprinos;
}

/** Što je korisnik potrošio (zadnjih 7 dana) i napravio u katalogu; ključ je e-mail malim slovima. */
export interface Doprinos {
  /** AI krediti u kliznom prozoru kvote (`ai_potrosnja`, isti prozor kao lib/kvota.ts). */
  slike: number;
  zvukovi: number;
  /** Riječi u katalogu (aktivne) kojima je `rijeci.dodao`. */
  rijeci: number;
  /** Trenutno odobrene slike i izgovori koje je on odobrio (`pregledao`). */
  odobreneSlike: number;
  odobreniZvukovi: number;
}

const NULA: Doprinos = { slike: 0, zvukovi: 0, rijeci: 0, odobreneSlike: 0, odobreniZvukovi: 0 };

/** Doprinos svih korisnika jednim upitom (po e-mailu, pa uključuje i superadmina bez retka). */
export async function doprinosi(): Promise<Map<string, Doprinos>> {
  const { results } = await env.DB.prepare(
    `WITH
       p AS (SELECT lower(k.email) AS email, SUM(CASE WHEN a.vrsta = 'slike' THEN a.kolicina ELSE 0 END) AS slike,
               SUM(CASE WHEN a.vrsta = 'zvukovi' THEN a.kolicina ELSE 0 END) AS zvukovi
             FROM ai_potrosnja a JOIN korisnici k ON k.id = a.korisnik_id
             WHERE a.at > datetime('now', '-7 days') GROUP BY 1),
       r AS (SELECT lower(dodao) AS email, COUNT(*) AS n FROM rijeci
             WHERE dodao IS NOT NULL AND aktivna = 1 AND vrsta = 'rijec' GROUP BY 1),
       s AS (SELECT lower(pregledao) AS email, COUNT(*) AS n FROM slike WHERE status = 'odobrena' AND pregledao IS NOT NULL GROUP BY 1),
       z AS (SELECT lower(pregledao) AS email, COUNT(*) AS n FROM zvukovi WHERE status = 'odobren' AND pregledao IS NOT NULL GROUP BY 1),
       e AS (SELECT email FROM p UNION SELECT email FROM r UNION SELECT email FROM s UNION SELECT email FROM z)
     SELECT e.email, COALESCE(p.slike, 0) AS slike, COALESCE(p.zvukovi, 0) AS zvukovi, COALESCE(r.n, 0) AS rijeci,
       COALESCE(s.n, 0) AS odobreneSlike, COALESCE(z.n, 0) AS odobreniZvukovi
     FROM e LEFT JOIN p ON p.email = e.email LEFT JOIN r ON r.email = e.email
       LEFT JOIN s ON s.email = e.email LEFT JOIN z ON z.email = e.email`,
  ).all<Doprinos & { email: string }>();
  return new Map(results.map(({ email, ...d }) => [email, d]));
}

/** Cijeli broj 0…LIMIT_MAX iz forme; inače null. */
export function procitajLimit(v: unknown): number | null {
  if (typeof v !== "string" || !/^\s*\d{1,6}\s*$/.test(v)) return null;
  const n = Number(v.trim());
  return n <= LIMIT_MAX ? n : null;
}

const RANG: Record<string, number> = { superadmin: 0, logoped: 1 };

export async function popisKorisnika(): Promise<KorisnikPrikaz[]> {
  const [{ results }, dop] = await Promise.all([env.DB.prepare(
    `SELECT k.id, k.email, k.ime, k.uloga, k.aktivan, k.deaktiviran_at, k.limit_slike_7d, k.limit_zvukovi_7d, k.limit_uredaja,
       (SELECT COUNT(*) FROM admin_passkeys p WHERE lower(p.email) = k.email) AS kljuceva,
       NULLIF(MAX(
         COALESCE((SELECT MAX(s.created_at) FROM admin_sessions s WHERE lower(s.email) = k.email), ''),
         COALESCE((SELECT MAX(p.last_used_at) FROM admin_passkeys p WHERE lower(p.email) = k.email), '')
       ), '') AS zadnja_prijava
     FROM korisnici k`,
  ).all<Omit<KorisnikPrikaz, "uloga" | "ulogaRetka" | "doprinos"> & { uloga: string }>(), doprinosi()]);
  const sa = adminEmails();
  const doprinos = (email: string) => dop.get(email.toLowerCase()) ?? NULA;
  const out: KorisnikPrikaz[] = results.map((r) => ({
    ...r, ulogaRetka: r.uloga, uloga: odrediUlogu(r.email, sa, { uloga: r.uloga, aktivan: r.aktivan }), doprinos: doprinos(r.email),
  }));
  // Superadmin bez retka (redak nastaje tek kad nešto spremi).
  const imaju = new Set(out.map((r) => r.email.toLowerCase()));
  for (const email of sa) {
    if (imaju.has(email)) continue;
    const z = await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM admin_passkeys WHERE lower(email) = ?1) AS kljuceva,
         NULLIF(MAX(COALESCE((SELECT MAX(created_at) FROM admin_sessions WHERE lower(email) = ?1), ''),
           COALESCE((SELECT MAX(last_used_at) FROM admin_passkeys WHERE lower(email) = ?1), '')), '') AS zadnja_prijava`,
    ).bind(email).first<{ kljuceva: number; zadnja_prijava: string | null }>();
    out.push({
      id: null, email, ime: null, uloga: "superadmin", ulogaRetka: null, aktivan: 1, deaktiviran_at: null,
      limit_slike_7d: null, limit_zvukovi_7d: null, limit_uredaja: null, kljuceva: z?.kljuceva ?? 0, zadnja_prijava: z?.zadnja_prijava ?? null,
      doprinos: doprinos(email),
    });
  }
  return out.sort((a, b) => (RANG[a.uloga ?? ""] ?? 2) - (RANG[b.uloga ?? ""] ?? 2) || a.email.localeCompare(b.email));
}

type Ishod = { ok: true } | { ok: false; greska: string };

async function redak(id: number) {
  return env.DB.prepare("SELECT id, email, uloga, aktivan FROM korisnici WHERE id = ?")
    .bind(id).first<{ id: number; email: string; uloga: string; aktivan: number }>();
}

/**
 * Deaktivacija: `aktivan=0`, `deaktiviran_at`, brišu se sve sesije tog e-maila i opozivaju njegove
 * otvorene pozivnice (inače bi stari link vratio pristup). Passkeyi ostaju, pa aktivacija vraća pristup.
 * Aktivacija samo za redak `uloga='logoped'`.
 */
export async function postaviAktivan(id: number, aktivan: boolean, tko: string, sada = new Date()): Promise<Ishod> {
  const k = await redak(id);
  if (!k) return { ok: false, greska: "Nema tog korisnika." };
  const email = k.email.toLowerCase();
  if (adminEmails().has(email)) return { ok: false, greska: "Superadmin (ADMIN_EMAILS) se ovdje ne mijenja." };
  const db = env.DB;
  const at = sada.toISOString();
  const grupa = novaGrupa();
  const z = (tablica: Zapis["tablica"], radnja: string): Zapis => ({ tko, radnja, tablica, grupa });
  if (aktivan) {
    if (k.uloga !== "logoped") return { ok: false, greska: "Aktivirati se može samo logoped." };
    await db.batch(sZapisom(z("korisnici", "korisnik.aktiviran"), id, [
      db.prepare("UPDATE korisnici SET aktivan = 1, deaktiviran_at = NULL WHERE id = ? AND aktivan = 0").bind(id),
    ]));
    return { ok: true };
  }
  await db.batch([
    ...sZapisom(z("korisnici", "korisnik.deaktiviran"), id, [
      db.prepare("UPDATE korisnici SET aktivan = 0, deaktiviran_at = ? WHERE id = ? AND aktivan = 1").bind(at, id),
    ]),
    db.prepare("DELETE FROM admin_sessions WHERE lower(email) = ?").bind(email),
    ...zapisSkupa(z("pozivi", "poziv.opozvan"), {
      sql: "x.email = ? AND x.iskoristena_at IS NULL AND x.opozvana_at IS NULL", args: [email],
    }, [
      db.prepare("UPDATE pozivi SET opozvana_at = ? WHERE email = ? AND iskoristena_at IS NULL AND opozvana_at IS NULL").bind(at, email),
    ]),
  ]);
  return { ok: true };
}

/** Tjedni AI limiti (odluka 10). Superadmin je bez limita, pa se njegov redak ne dira. */
export async function postaviLimite(id: number, slike: number | null, zvukovi: number | null, tko: string): Promise<Ishod> {
  if (slike === null || zvukovi === null) return { ok: false, greska: `Limit mora biti cijeli broj od 0 do ${LIMIT_MAX}.` };
  const k = await redak(id);
  if (!k) return { ok: false, greska: "Nema tog korisnika." };
  if (adminEmails().has(k.email.toLowerCase())) return { ok: false, greska: "Superadmin nema limit." };
  await env.DB.batch(sZapisom({ tko, radnja: "korisnik.limit", tablica: "korisnici", grupa: novaGrupa() }, id, [
    env.DB.prepare("UPDATE korisnici SET limit_slike_7d = ?, limit_zvukovi_7d = ? WHERE id = ?").bind(slike, zvukovi, id),
  ]));
  return { ok: true };
}
