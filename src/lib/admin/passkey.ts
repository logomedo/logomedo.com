// Iz omm.domovina.ai src/lib/admin/ (2026-10-31), tamo iz pay.domovina.ai. Sigurnosnu logiku držati u skladu.
// Preneseno iz pay.domovina.ai backend/src/admin/auth/passkey.ts — držati u skladu.
// WebAuthn ceremonije preko @simplewebauthn/server. rpID i origin izvode se iz
// zahtjeva: ključ upisan na localhostu ne otvara produkciju.
import { env } from "cloudflare:workers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { consumeChallenge, storeChallenge, ulogaZa } from "./sesija";

const RP_NAME = "LogoMedo admin";

interface PasskeyRow { id: string; email: string; public_key: string; counter: number; transports: string | null }

const ctx = (url: URL) => ({ rpID: url.hostname, origin: url.origin });
const transports = (t: string | null) => (t ? (t.split(",") as AuthenticatorTransport[]) : undefined);

/** `purpose = "poziv"`: upis iz pozivnice (javna stranica), izazov nosi e-mail pozivnice. */
export async function registrationOptions(url: URL, email: string, purpose: "register" | "poziv" = "register") {
  const existing = await env.DB.prepare("SELECT id, transports FROM admin_passkeys WHERE email = ?")
    .bind(email)
    .all<{ id: string; transports: string | null }>();
  const userID = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email)));
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: ctx(url).rpID,
    userName: email,
    userID,
    attestationType: "none",
    excludeCredentials: existing.results.map((k) => ({ id: k.id, transports: transports(k.transports) })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  // Preferiraj ovo računalo (Google Password Manager / Windows Hello / iCloud) pa mobitel (QR) prije USB
  // ključa. Samo hint, ne authenticatorAttachment: „platform” bi isključio mobitel. Bez toga Chrome na
  // Windowsu bez Hello PIN-a i bez prijave u Chrome odmah traži USB ključ (Tea, 23. 11. 2026.).
  options.hints = ["client-device", "hybrid"];
  await storeChallenge(options.challenge, purpose, email);
  return options;
}

/** Provjereni novi ključ, spreman za upis u `admin_passkeys`. */
export interface NoviPasskey { id: string; publicKey: string; counter: number; transports: string | null; rpId: string }

/** Oznaka ključa kako se upisuje (najviše 80 znakova, prazna → „passkey”). */
export const oznakaKljuca = (label: string) => label.trim().slice(0, 80) || "passkey";

/**
 * WebAuthn provjera upisa, bez upisa u bazu (pozivnica ga stavlja u svoj batch). Izazov se troši
 * pri provjeri i mora imati istu namjenu i isti e-mail.
 */
export async function provjeriRegistraciju(
  url: URL, email: string, response: RegistrationResponseJSON, purpose: "register" | "poziv" = "register",
): Promise<NoviPasskey | null> {
  const { rpID, origin } = ctx(url);
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: async (c) => (await consumeChallenge(c, purpose))?.email === email,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  }).catch(() => null);
  if (!result?.verified) return null;
  const { credential } = result.registrationInfo;
  return {
    id: credential.id, publicKey: isoBase64URL.fromBuffer(credential.publicKey), counter: credential.counter,
    transports: credential.transports?.join(",") ?? null, rpId: rpID,
  };
}

export async function verifyRegistration(url: URL, email: string, response: RegistrationResponseJSON, label: string): Promise<boolean> {
  const k = await provjeriRegistraciju(url, email, response, "register");
  if (!k) return false;
  await env.DB.prepare(
    `INSERT INTO admin_passkeys (id, email, public_key, counter, transports, label, created_at, rp_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(k.id, email, k.publicKey, k.counter, k.transports, oznakaKljuca(label), new Date().toISOString(), k.rpId)
    .run();
  return true;
}

export async function loginOptions(url: URL) {
  const options = await generateAuthenticationOptions({
    rpID: ctx(url).rpID,
    userVerification: "required",
    allowCredentials: [], // discoverable: autentifikator sam ponudi ključ za ovu domenu
  });
  await storeChallenge(options.challenge, "login", null);
  return options;
}

/** Vraća e-mail vlasnika ključa ili null. Poruke greške namjerno ne razlikuju razloge. */
export async function verifyLogin(url: URL, response: AuthenticationResponseJSON): Promise<string | null> {
  const key = await env.DB.prepare("SELECT id, email, public_key, counter, transports FROM admin_passkeys WHERE id = ?")
    .bind(response.id)
    .first<PasskeyRow>();
  // Superadmin (ADMIN_EMAILS) ili aktivan logoped; deaktiviran ključ ne vodi nikamo.
  if (!key || !(await ulogaZa(key.email))) return null;

  const { rpID, origin } = ctx(url);
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: async (c) => (await consumeChallenge(c, "login")) !== null,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: { id: key.id, publicKey: isoBase64URL.toBuffer(key.public_key), counter: key.counter, transports: transports(key.transports) },
  }).catch(() => null);
  if (!result?.verified) return null;

  await env.DB.prepare("UPDATE admin_passkeys SET counter = ?, last_used_at = ? WHERE id = ?")
    .bind(result.authenticationInfo.newCounter, new Date().toISOString(), key.id)
    .run();
  return key.email;
}

/** Ukradeni kolačić ne smije postati trajni passkey: svježa prijava i najviše 5 po e-mailu. */
const PASSKEY_REAUTH_SECONDS = 10 * 60;
const MAX_PASSKEYS_PER_EMAIL = 5;

export async function registerRefusal(s: { email: string; createdAt: string }, url: URL): Promise<string | null> {
  const age = (Date.now() - Date.parse(s.createdAt)) / 1000;
  if (!(age <= PASSKEY_REAUTH_SECONDS)) {
    return "Za dodavanje passkeya prijava mora biti svježa (< 10 min): odjavi se i prijavi ponovno.";
  }
  // Broje se samo ključevi ove domene: na stagingu (kopija produkcije) produkcijski ne zauzimaju mjesto.
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM admin_passkeys WHERE email = ? AND ${RP} = ?`)
    .bind(s.email, ctx(url).rpID).first<{ n: number }>();
  if ((row?.n ?? 0) >= MAX_PASSKEYS_PER_EMAIL) {
    return `Najviše ${MAX_PASSKEYS_PER_EMAIL} passkeya po e-mailu — obriši stari pa dodaj novi.`;
  }
  return null;
}

// ---- Ključevi u /admin/postavke (prije /admin/passkeys): svatko vidi i briše samo svoje ključeve (e-mail iz sesije) ----

/** Domena ključa; NULL = upisan prije migracije 0049, dakle na produkciji. */
export const PRODUKCIJSKA_DOMENA = "logomedo.com";
const RP = `COALESCE(rp_id, '${PRODUKCIJSKA_DOMENA}')`;

/** Ključevi e-maila; `rpId` je domena na kojoj ključ radi (usporedi s hostom zahtjeva). */
export async function mojiKljucevi(email: string) {
  return (await env.DB.prepare(
    `SELECT id, label, created_at, last_used_at, ${RP} AS rp_id FROM admin_passkeys WHERE email = ? ORDER BY created_at`,
  ).bind(email).all<{ id: string; label: string; created_at: string; last_used_at: string | null; rp_id: string }>()).results;
}

/** Briše ključ samo ako je vlasnik `email`; tuđi id ne radi ništa. */
export async function obrisiKljuc(id: string, email: string): Promise<boolean> {
  const r = await env.DB.prepare("DELETE FROM admin_passkeys WHERE id = ? AND email = ?").bind(id, email).run();
  return (r.meta.changes ?? 0) > 0;
}
