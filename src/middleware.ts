// /admin: prijava preko Cloudflare Accessa ili passkeya (docs/admin.md, model iz
// omm.domovina.ai i pay.domovina.ai). /api/runner/*: lokalni runner s bearer tokenom.
import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { getSession, sha256Hex } from "./lib/admin/sesija";

const JAVNO = new Set([
  "/admin/login",
  "/admin/sso",
  "/admin/passkey/login/options",
  "/admin/passkey/login/verify",
  "/admin/logout",
]);

const jeAdmin = (p: string) => p === "/admin" || p.startsWith("/admin/");
/** Dekodirana, bez dvostrukih kosih crta i malim slovima putanja mora proći istu provjeru. */
const adminPutanja = (p: string) => {
  let d = p;
  try { d = decodeURIComponent(p); } catch {}
  return jeAdmin(p) || jeAdmin(d.replace(/\/{2,}/g, "/").toLowerCase());
};
const lokalno = (h: string) => h === "localhost" || h === "127.0.0.1";
const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

/** Usporedba tokena preko hasha: jednaka duljina, bez ranog izlaza po znaku. */
async function runnerOk(request: Request): Promise<boolean> {
  const dano = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const tajna = env.RUNNER_TOKEN;
  if (!dano || !tajna) return false;
  const [a, b] = await Promise.all([sha256Hex(dano), sha256Hex(tajna)]);
  let razlika = 0;
  for (let i = 0; i < a.length; i++) razlika |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return razlika === 0;
}

export const onRequest = defineMiddleware(async ({ request, url, locals }, next) => {
  // Jedan kanonski host: www → apex (passkey rpID i kolačić su vezani uz host).
  if (url.hostname === "www.logomedo.com") return Response.redirect(`https://logomedo.com${url.pathname}${url.search}`, 301);
  if (url.pathname.startsWith("/api/runner/")) {
    return (await runnerOk(request)) ? next() : json({ error: "unauthorized" }, 401);
  }
  if (!adminPutanja(url.pathname)) return zastiti(await next(), false);

  // 1. Jedan host: rpID passkeya je hostname, a Access štiti samo ADMIN_HOST/admin/sso.
  const host = (env.ADMIN_HOST ?? "").trim();
  if (host && url.hostname !== host && !lokalno(url.hostname)) {
    if (request.method !== "GET") return json({ error: "wrong_admin_host", admin_host: host }, 421);
    return Response.redirect(`https://${host}${url.pathname}${url.search}`, 301);
  }

  // 2. CSRF: svaka promjena mora doći s istog origina (kolačić je SameSite=Lax).
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== url.origin) return json({ error: "bad_origin" }, 403);
  }

  // 3. Sesija za sve osim javnih putanja.
  if (!JAVNO.has(url.pathname)) {
    const s = await getSession(request.headers.get("cookie"));
    if (!s) {
      if (request.method !== "GET" || url.pathname.startsWith("/admin/api/")) return json({ error: "unauthorized" }, 401);
      return Response.redirect(new URL(`/admin/login?next=${encodeURIComponent(url.pathname + url.search)}`, url), 302);
    }
    locals.admin = s;
  }

  return zastiti(await next(), true);
});

/** Sigurnosna zaglavlja; inline skripte koje Astro umeće dobivaju nonce. */
async function zastiti(odgovor: Response, admin: boolean): Promise<Response> {
  const html = (odgovor.headers.get("content-type") ?? "").startsWith("text/html");
  if (!admin && !html) return odgovor;
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/[+/=]/g, "");
  let tijelo: BodyInit | null = odgovor.body;
  if (html) tijelo = (await odgovor.text()).replace(/<script(?![^>]*\bsrc=)/g, `<script nonce="${nonce}"`);
  const h = new Headers(odgovor.headers);
  h.set(
    "content-security-policy",
    `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; ` +
      `img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
  );
  h.set("x-content-type-options", "nosniff");
  // Admin: ne "no-referrer", jer uz nju preglednik na <form> POST šalje `Origin: null`.
  h.set("referrer-policy", admin ? "same-origin" : "strict-origin-when-cross-origin");
  h.set("x-frame-options", "DENY");
  if (admin) h.set("x-robots-tag", "noindex");
  if (!h.has("cache-control")) h.set("cache-control", admin ? "no-store" : "no-cache");
  return new Response(tijelo, { status: odgovor.status, statusText: odgovor.statusText, headers: h });
}
