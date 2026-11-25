// Catch-all rute na starim adresama Uprave (docs/uprava/plan.md). Astro za nepostojeću rutu ne vodi zahtjev kroz
// isti middleware put (dobije se 404), pa stara adresa mora postojati kao ruta. Preusmjerava middleware (4b, nakon
// provjere uloge); ovo je samo druga obrana ako middleware ne preusmjeri.
import type { APIRoute } from "astro";
import { preseljeno } from "./rute";

export const preusmjeri: APIRoute = ({ url, request }) => {
  const nova = preseljeno(url.pathname);
  if (!nova) return new Response("Nema stranice", { status: 404 });
  return Response.redirect(new URL(nova + url.search, url), request.method === "GET" || request.method === "HEAD" ? 301 : 308);
};
