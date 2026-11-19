// sitemap.xml landinga: stranice iz STRANICE u src/landing/konstante.ts (odluka 200; od S7 i /pristup). Prerenderirano u dist/client.
import type { APIRoute } from "astro";
import { sitemapXml } from "../landing/konstante";

export const prerender = true;

export const GET: APIRoute = () => new Response(sitemapXml(), { headers: { "content-type": "application/xml; charset=utf-8" } });
