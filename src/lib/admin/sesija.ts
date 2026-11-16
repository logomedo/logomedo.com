// Iz omm.domovina.ai src/lib/admin/ (2026-10-31), tamo iz pay.domovina.ai. Sigurnosnu logiku držati u skladu.
// Admin sesija. Preneseno iz pay.domovina.ai (backend/src/admin/auth/{env,session}.ts,
// a tamo iz bank-push-gateway) — držati u skladu.
// Nasumičan token u kolačiću, u D1 samo njegov sha-256. Pri svakom zahtjevu se iznova
// određuje uloga, pa micanje iz ADMIN_EMAILS ili deaktivacija oduzima pristup odmah.
// Razlika od omm: ovdje postoje uloge (ovlasti.ts): superadmin iz ADMIN_EMAILS, logoped
// iz `korisnici` (uloga = 'logoped', aktivan = 1); u omm je admin samo ADMIN_EMAILS.
import { env } from "cloudflare:workers";
import { odrediUlogu, type Uloga } from "./ovlasti.ts";

export const SESSION_COOKIE = "__Host-logomedo_admin";
export const SESSION_TTL_SECONDS = 12 * 3600;
const CHALLENGE_TTL_SECONDS = 300;
/** Sesija koju nitko nije koristio toliko dugo je gotova, bez obzira na istek. */
const SESSION_IDLE_SECONDS = 2 * 3600;
const LAST_SEEN_RESOLUTION_SECONDS = 300;

export type SessionMethod = "passkey" | "access" | "poziv";
export interface Session {
  email: string;
  method: SessionMethod;
  expiresAt: string;
  /** Kad je prijava bila; dodavanje passkeya traži svježu. */
  createdAt: string;
  uloga: Uloga;
  /** Redak u `korisnici`; superadmin ga možda još nema (korisnikId() ga stvara lijeno). */
  korisnikId: number | null;
}

/** E-mailovi koji smiju u admin. Provjerava se pri svakom zahtjevu. */
export function adminEmails(): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
}

/** Uloga i redak za e-mail (passkey prijava); null = nema pristup. */
export async function ulogaZa(email: string): Promise<{ uloga: Uloga; korisnikId: number | null } | null> {
  const red = await env.DB.prepare("SELECT id, uloga, aktivan FROM korisnici WHERE email = ?")
    .bind(email.trim().toLowerCase())
    .first<{ id: number; uloga: string; aktivan: number }>();
  const uloga = odrediUlogu(email, adminEmails(), red);
  return uloga ? { uloga, korisnikId: red?.id ?? null } : null;
}

export const accessConfigured = () => Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);

export async function sha256Hex(message: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionCookie(token: string, maxAge: number): string {
  // Lax, ne Strict: povratak s Access prijave je navigacija s druge domene.
  // CSRF štiti provjera Origin zaglavlja na svakom POST-u (middleware).
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function createSession(email: string, method: SessionMethod, userAgent: string | null): Promise<string> {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").bind(now.toISOString()),
    env.DB.prepare(
      `INSERT INTO admin_sessions (token_hash, email, method, created_at, expires_at, user_agent, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(await sha256Hex(token), email, method, now.toISOString(), expires.toISOString(),
      userAgent?.slice(0, 256) ?? null, now.toISOString()),
  ]);
  return token;
}

export async function getSession(cookieHeader: string | null): Promise<Session | null> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.email, s.method, s.created_at, s.expires_at, s.last_seen_at,
            k.id AS korisnik_id, k.uloga, k.aktivan
     FROM admin_sessions s LEFT JOIN korisnici k ON k.email = lower(s.email)
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(hash, new Date().toISOString())
    .first<{
      email: string; method: SessionMethod; created_at: string; expires_at: string; last_seen_at: string | null;
      korisnik_id: number | null; uloga: string | null; aktivan: number | null;
    }>();
  if (!row) return null;
  const uloga = odrediUlogu(row.email, adminEmails(), row.korisnik_id === null ? null : { uloga: row.uloga ?? "", aktivan: row.aktivan ?? 0 });
  if (!uloga) return null;
  const nowMs = Date.now();
  const lastSeenMs = Date.parse(row.last_seen_at ?? row.created_at);
  if (Number.isFinite(lastSeenMs) && nowMs - lastSeenMs > SESSION_IDLE_SECONDS * 1000) return null;
  if (!Number.isFinite(lastSeenMs) || nowMs - lastSeenMs > LAST_SEEN_RESOLUTION_SECONDS * 1000) {
    await env.DB.prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?")
      .bind(new Date(nowMs).toISOString(), hash)
      .run()
      .catch(() => {});
  }
  return {
    email: row.email, method: row.method, expiresAt: row.expires_at, createdAt: row.created_at,
    uloga, korisnikId: row.korisnik_id,
  };
}

export async function deleteSession(cookieHeader: string | null): Promise<void> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
}

export async function storeChallenge(challenge: string, purpose: "login" | "register", email: string | null) {
  const now = new Date();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_challenges WHERE expires_at < ?").bind(now.toISOString()),
    env.DB.prepare("INSERT INTO admin_challenges (challenge, purpose, email, expires_at) VALUES (?, ?, ?, ?)")
      .bind(challenge, purpose, email, new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000).toISOString()),
  ]);
}

/** Jednokratno: izazov se briše pri prvoj provjeri, bez obzira na ishod. */
export async function consumeChallenge(challenge: string, purpose: "login" | "register"): Promise<{ email: string | null } | null> {
  const row = await env.DB.prepare(
    "DELETE FROM admin_challenges WHERE challenge = ? RETURNING purpose, email, expires_at",
  )
    .bind(challenge)
    .first<{ purpose: string; email: string | null; expires_at: string }>();
  if (!row || row.purpose !== purpose || row.expires_at < new Date().toISOString()) return null;
  return { email: row.email };
}

/** Odredište nakon prijave: samo relativna putanja unutar admina (nema otvorenog preusmjeravanja). */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/admin") && !next.startsWith("//") && !next.includes("\\") ? next : "/admin";
}

/** Nova sesija: kolačić i preusmjeravanje (Access) ili JSON (passkey). */
export async function startSession(request: Request, email: string, method: SessionMethod, next: string, asJson = false) {
  const token = await createSession(email, method, request.headers.get("user-agent"));
  const cookie = sessionCookie(token, SESSION_TTL_SECONDS);
  return asJson
    ? new Response(JSON.stringify({ ok: true, next }), { headers: { "content-type": "application/json", "set-cookie": cookie } })
    : new Response(null, { status: 302, headers: { location: next, "set-cookie": cookie } });
}
