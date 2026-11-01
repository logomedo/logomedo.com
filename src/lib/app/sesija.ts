// Sesije mobilne aplikacije (docs/app-api.md). Bearer token, nikad kolačić: /api/v1 zato
// ne treba CSRF provjeru, a admin kolačić s weba tu ne vrijedi ništa.
import { env } from "cloudflare:workers";
import { adminEmails } from "../admin/sesija";
import { ispravanIzazov, izazovIz, ispravanVerifikator, jednako, nasumicno, oznakaUredaja, sha256Hex } from "./pkce";

const KOD_TTL_S = 120;
export const SESIJA_TTL_S = 30 * 24 * 3600;
const NEAKTIVNOST_S = 7 * 24 * 3600;
const LAST_SEEN_KORAK_S = 15 * 60;

/** Uloga se izvodi pri svakom zahtjevu. Kasnije: 'logoped' iz tablice računa. */
export type Uloga = "admin";
export interface AppSesija { email: string; uloga: Uloga; uredaj: string | null; expiresAt: string }

export const uloga = (email: string): Uloga | null => (adminEmails().has(email) ? "admin" : null);

/** Admin je u pregledniku potvrdio prijavu: jednokratni kod za aplikaciju. */
export async function izdajKod(email: string, izazov: string, uredaj: unknown): Promise<string | null> {
  if (!ispravanIzazov(izazov)) return null;
  const kod = nasumicno(32);
  const sada = new Date();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM app_kodovi WHERE expires_at < ?").bind(sada.toISOString()),
    env.DB.prepare("INSERT INTO app_kodovi (kod_hash, email, izazov, uredaj, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256Hex(kod), email, izazov, oznakaUredaja(uredaj), new Date(sada.getTime() + KOD_TTL_S * 1000).toISOString()),
  ]);
  return kod;
}

/** Kod + PKCE verifikator → token. Kod se briše pri prvom pokušaju, bez obzira na ishod. */
export async function zamijeniKod(kod: unknown, verifikator: unknown) {
  if (typeof kod !== "string" || kod.length > 100 || !ispravanVerifikator(verifikator)) return null;
  const red = await env.DB.prepare("DELETE FROM app_kodovi WHERE kod_hash = ? RETURNING email, izazov, uredaj, expires_at")
    .bind(await sha256Hex(kod))
    .first<{ email: string; izazov: string; uredaj: string | null; expires_at: string }>();
  if (!red || red.expires_at < new Date().toISOString()) return null;
  if (!jednako(await izazovIz(verifikator), red.izazov)) return null;
  const u = uloga(red.email);
  if (!u) return null;

  const token = nasumicno(32);
  const sada = new Date();
  const istjece = new Date(sada.getTime() + SESIJA_TTL_S * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM app_sesije WHERE expires_at < ?").bind(sada.toISOString()),
    env.DB.prepare(
      "INSERT INTO app_sesije (token_hash, email, uredaj, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(await sha256Hex(token), red.email, red.uredaj, sada.toISOString(), istjece, sada.toISOString()),
  ]);
  return { token, email: red.email, uloga: u, istjece };
}

const bearer = (request: Request) => /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;

export async function appSesija(request: Request): Promise<AppSesija | null> {
  const token = bearer(request);
  if (!token) return null;
  const hash = await sha256Hex(token);
  const red = await env.DB.prepare(
    "SELECT email, uredaj, expires_at, last_seen_at FROM app_sesije WHERE token_hash = ? AND expires_at > ?",
  ).bind(hash, new Date().toISOString()).first<{ email: string; uredaj: string | null; expires_at: string; last_seen_at: string }>();
  if (!red) return null;
  const u = uloga(red.email);
  if (!u) return null;
  const proslo = Date.now() - Date.parse(red.last_seen_at);
  if (proslo > NEAKTIVNOST_S * 1000) return null;
  if (proslo > LAST_SEEN_KORAK_S * 1000) {
    await env.DB.prepare("UPDATE app_sesije SET last_seen_at = ? WHERE token_hash = ?").bind(new Date().toISOString(), hash).run().catch(() => {});
  }
  return { email: red.email, uloga: u, uredaj: red.uredaj, expiresAt: red.expires_at };
}

export async function odjavi(request: Request) {
  const token = bearer(request);
  if (token) await env.DB.prepare("DELETE FROM app_sesije WHERE token_hash = ?").bind(await sha256Hex(token)).run();
}
