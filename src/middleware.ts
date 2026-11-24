// /admin: prijava preko Cloudflare Accessa ili passkeya (docs/admin.md, model iz
// omm.domovina.ai i pay.domovina.ai). /api/runner/*: lokalni runner s bearer tokenom.
// Razlika od omm: uloge (docs/rbac/). Sesija nosi ulogu; rute iz lib/admin/rute.ts smije samo
// superadmin (logoped: 403), a vlasništvo zadataka, bilježnica i aktivnosti provjerava lib/admin/vlasnistvo.ts.
// Druga razlika: `KvotaPrekoracena` (AI kvota, lib/kvota.ts) iz stranice ili rute hvata se ovdje (`sKvotom`):
// JSON 429 za API i fetch, inače 303 natrag s `?kvota=<vrsta>` (poruku sastavlja AdminOkvir).
// Treća: uređaji (lib/admin/uredaji.ts, docs/uredaji.md). Račun otvoren na previše uređaja odjednom
// dobiva stranicu „Nastavi ovdje” (409) umjesto tražene, a fetch JSON 409 `previse_uredaja`.
import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { getSession } from "./lib/admin/sesija";
import { rutaSamoSuperadmin } from "./lib/admin/rute";
import { runnerOk } from "./lib/runner-auth";
import { appSesija } from "./lib/app/sesija";
import { KvotaPrekoracena, odgovorNaKvotu } from "./lib/kvota";
import { provjeriUredaj } from "./lib/admin/uredaji";

/** Bez provjere uređaja: odjava i samo preuzimanje moraju raditi i s „previše” uređaja. */
const BEZ_UREDAJA = new Set(["/admin/uredaji/preuzmi", "/admin/uredaji/previse", "/admin/logout"]);

const JAVNO = new Set([
  "/admin/login",
  "/admin/sso",
  "/admin/passkey/login/options",
  "/admin/passkey/login/verify",
  "/admin/logout",
  // Pozivnica (docs/rbac/): dokaz je token iz linka, ne sesija. CSRF (Origin) i dalje vrijedi.
  "/admin/poziv",
  "/admin/poziv/options",
  "/admin/poziv/verify",
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

export const onRequest = defineMiddleware(async ({ request, url, locals }, next) => {
  // Jedan kanonski host: www → apex (passkey rpID i kolačić su vezani uz host).
  if (url.hostname === "www.logomedo.com") return Response.redirect(`https://logomedo.com${url.pathname}${url.search}`, 301);
  if (url.pathname.startsWith("/api/runner/")) {
    return (await runnerOk(request)) ? next() : json({ error: "unauthorized" }, 401);
  }
  if (url.pathname === "/api/v1" || url.pathname.startsWith("/api/v1/")) return apiV1(request, url, locals, next);
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
    // 4. Uloga: administracija (prompt, red, korisnici, glasovi, prijava aplikacije) samo superadmin.
    if (s.uloga !== "superadmin" && rutaSamoSuperadmin(url.pathname)) {
      if (!["GET", "HEAD"].includes(request.method) || url.pathname.startsWith("/admin/api/")) return json({ error: "forbidden" }, 403);
      return zastiti(await nemasPristup(next), true);
    }
    // 5. Uređaji: tabovi istog preglednika su jedan uređaj; treći preglednik odjednom bira „Nastavi ovdje”.
    if (!BEZ_UREDAJA.has(url.pathname)) {
      const u = await provjeriUredaj(request, s);
      if (!u.ok) {
        if (request.method !== "GET" || url.pathname.startsWith("/admin/api/") || request.headers.get("accept")?.includes("application/json")) {
          const r = json({ error: "previse_uredaja" }, 409);
          r.headers.set("x-uredaj", "previse");
          if (u.setCookie) r.headers.append("set-cookie", u.setCookie);
          return r;
        }
        locals.previseUredaja = { ...u, nakon: url.pathname + url.search };
        return zastiti(await previseUredaja(next, u.setCookie), true);
      }
      if (u.setCookie) return zastiti(sKolacicem(await sKvotom(request, url, next), u.setCookie), true);
    }
  }

  return zastiti(await sKvotom(request, url, next), true);
});

/** Prekoračena AI kvota je odbijen zahtjev (odluka 10), ne 500: ništa nije upisano. */
async function sKvotom(request: Request, url: URL, next: () => Promise<Response>): Promise<Response> {
  try {
    return await next();
  } catch (e) {
    if (e instanceof KvotaPrekoracena) return odgovorNaKvotu(e, request, url);
    throw e;
  }
}

/**
 * Stranica „Nemaš pristup” (src/pages/admin/nemas-pristup.astro) kroz rewrite, sa sesijom u `locals`.
 * Status je uvijek 403; ako rewrite ne vrati tu stranicu (oznaka u zaglavlju), jednostavan HTML.
 */
async function nemasPristup(next: (put?: string) => Promise<Response>): Promise<Response> {
  const r = await next("/admin/nemas-pristup");
  if (r.headers.get("x-nemas-pristup") === "1") {
    const h = new Headers(r.headers);
    h.delete("x-nemas-pristup");
    return new Response(r.body, { status: 403, headers: h });
  }
  await r.body?.cancel();
  return new Response(
    '<!doctype html><html lang="hr"><meta charset="utf-8"><title>Nemaš pristup</title><h1>Nemaš pristup</h1><p><a href="/admin">Natrag u admin</a></p></html>',
    { status: 403, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/** Stranica „Nastavi ovdje” (src/pages/admin/uredaji/previse.astro) kroz rewrite, status 409. */
async function previseUredaja(next: (put?: string) => Promise<Response>, setCookie: string | null): Promise<Response> {
  const r = await next("/admin/uredaji/previse");
  const h = new Headers(r.headers);
  h.delete("x-previse-uredaja");
  if (setCookie) h.append("set-cookie", setCookie);
  return new Response(r.body, { status: 409, headers: h });
}

/** Odgovor s dodanim kolačićem (redirect iz `Response.redirect` ima nepromjenjiva zaglavlja). */
function sKolacicem(r: Response, setCookie: string): Response {
  const h = new Headers(r.headers);
  h.append("set-cookie", setCookie);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}

/**
 * /api/v1: mobilna aplikacija (docs/app-api.md). Samo bearer token, kolačići se ne gledaju,
 * pa nema CSRF-a. /api/v1/admin/* traži ulogu admin.
 */
const API_JAVNO = new Set(["/api/v1/prijava/token"]);
async function apiV1(request: Request, url: URL, locals: App.Locals, next: () => Promise<Response>) {
  const host = (env.ADMIN_HOST ?? "").trim();
  if (host && url.hostname !== host && !lokalno(url.hostname)) return json({ error: "wrong_host", host }, 421);
  if (!API_JAVNO.has(url.pathname)) {
    const s = await appSesija(request);
    if (!s) return json({ error: "unauthorized" }, 401);
    if (url.pathname.startsWith("/api/v1/admin/") && s.uloga !== "admin") return json({ error: "forbidden" }, 403);
    locals.app = s;
  }
  const odgovor = await sKvotom(request, url, next);
  const h = new Headers(odgovor.headers);
  h.set("x-content-type-options", "nosniff");
  h.set("x-robots-tag", "noindex");
  if (!h.has("cache-control")) h.set("cache-control", "no-store");
  return new Response(odgovor.body, { status: odgovor.status, statusText: odgovor.statusText, headers: h });
}

/** Sigurnosna zaglavlja; inline skripte koje Astro umeće dobivaju nonce. */
async function zastiti(odgovor: Response, admin: boolean): Promise<Response> {
  const html = (odgovor.headers.get("content-type") ?? "").startsWith("text/html");
  if (!admin && !html) return odgovor;
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/[+/=]/g, "");
  let tijelo: BodyInit | null = odgovor.body;
  if (html) tijelo = (await odgovor.text()).replace(/<script(?![^>]*\bsrc=)/g, `<script nonce="${nonce}"`);
  const h = new Headers(odgovor.headers);
  // Javne bilježnice prikazuju odobrene slike s CDN-a (env.CDN_URL, zaseban host).
  const cdn = (env.CDN_URL ?? "").replace(/\/+$/, "");
  h.set(
    "content-security-policy",
    `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; ` +
      `img-src 'self' data:${cdn ? ` ${cdn}` : ""}; media-src 'self'${cdn ? ` ${cdn}` : ""}; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
  );
  h.set("x-content-type-options", "nosniff");
  // Admin: ne "no-referrer", jer uz nju preglednik na <form> POST šalje `Origin: null`.
  h.set("referrer-policy", admin ? "same-origin" : "strict-origin-when-cross-origin");
  h.set("x-frame-options", "DENY");
  if (admin) h.set("x-robots-tag", "noindex");
  if (!h.has("cache-control")) h.set("cache-control", admin ? "no-store" : "no-cache");
  return new Response(tijelo, { status: odgovor.status, statusText: odgovor.statusText, headers: h });
}
