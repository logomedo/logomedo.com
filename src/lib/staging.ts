// Zaštita staginga (docs/staging.md, landing odluka 7). Kad je OKRUZENJE "staging", cijeli host
// (i statičke datoteke, wrangler.jsonc env.staging assets.run_worker_first) traži Basic Auth s
// lozinkom iz secreta STAGING_LOZINKA. /api/v1 i /api/runner/* imaju vlastitu provjeru (bearer) i
// izuzeti su. Bez secreta staging vraća 503, nikad otvoreno. Svi odgovori staginga nose noindex.
// Bez OKRUZENJE (produkcija) ova funkcija samo zove `dalje()`.

export interface StagingEnv {
  OKRUZENJE?: string;
  STAGING_LOZINKA?: string;
}

const REALM = 'Basic realm="LogoMedo staging", charset="UTF-8"';

/** Putanje s vlastitom provjerom (bearer token). Dekodirana putanja ne smije imati "..". */
export function izuzeto(pathname: string): boolean {
  let d = pathname;
  try { d = decodeURIComponent(pathname); } catch { return false; }
  if (d.includes("..") || d.includes("//")) return false;
  return d === "/api/v1" || d.startsWith("/api/v1/") || d.startsWith("/api/runner/");
}

/** Lozinka iz `Authorization: Basic …` (korisničko ime je proizvoljno), ili null. */
export function lozinkaIzZaglavlja(zaglavlje: string | null): string | null {
  const m = zaglavlje?.match(/^Basic\s+([A-Za-z0-9+/=]+)\s*$/i);
  if (!m) return null;
  let par: string;
  try {
    par = new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
  const i = par.indexOf(":");
  return i < 0 ? null : par.slice(i + 1);
}

/** Usporedba u konstantnom vremenu: SHA-256 obiju strana (ista duljina), pa XOR po bajtu. */
export async function jednako(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let r = 0;
  for (let i = 0; i < u.length; i++) r |= u[i] ^ v[i];
  return r === 0;
}

function noindex(odgovor: Response): Response {
  // Odgovor iz fetcha/ASSETS-a ima nepromjenjiva zaglavlja; 101 (WebSocket) se ne dira.
  if (odgovor.status === 101) return odgovor;
  const r = new Response(odgovor.body, odgovor);
  r.headers.set("x-robots-tag", "noindex");
  return r;
}

export async function stagingVrata(
  request: Request,
  env: StagingEnv,
  dalje: () => Promise<Response>,
): Promise<Response> {
  if (env.OKRUZENJE !== "staging") return dalje();
  if (izuzeto(new URL(request.url).pathname)) return noindex(await dalje());
  if (!env.STAGING_LOZINKA) {
    return noindex(new Response("staging nije podešen", { status: 503, headers: { "cache-control": "no-store" } }));
  }
  const lozinka = lozinkaIzZaglavlja(request.headers.get("authorization"));
  if (lozinka === null || !(await jednako(lozinka, env.STAGING_LOZINKA))) {
    return noindex(new Response("potrebna je lozinka staginga", {
      status: 401,
      headers: { "www-authenticate": REALM, "cache-control": "no-store" },
    }));
  }
  return noindex(await dalje());
}
