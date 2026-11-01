// PKCE (RFC 7636, samo S256) i nasumični tokeni za prijavu aplikacije. Bez ovisnosti o
// cloudflare:workers, da se može testirati u Nodeu.

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function nasumicno(bajtova = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bajtova)));
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** base64url(sha256(verifikator)), kao `code_challenge` s metodom S256. */
export async function izazovIz(verifikator: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifikator))));
}

/** RFC 7636: 43–128 znakova iz [A-Za-z0-9-._~]. Izazov S256 je uvijek točno 43 znaka base64url. */
export const ispravanVerifikator = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9\-._~]{43,128}$/.test(v);
export const ispravanIzazov = (c: unknown): c is string => typeof c === "string" && /^[A-Za-z0-9_-]{43}$/.test(c);

/** Usporedba bez ranog izlaza (oba niza su iste duljine kad su ispravni). */
export function jednako(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Oznaka uređaja iz aplikacije: kratka, bez kontrolnih znakova. */
export const oznakaUredaja = (u: unknown) =>
  typeof u === "string" ? u.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) || null : null;
