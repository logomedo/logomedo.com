// sitemap.xml landinga: šest stranica iz src/landing/konstante.ts (odluka 200). Prerenderirano u dist/client.
import type { APIRoute } from "astro";
import { sitemapXml } from "../landing/konstante";

export const prerender = true;

export const GET: APIRoute = () => new Response(sitemapXml(), { headers: { "content-type": "application/xml; charset=utf-8" } });
