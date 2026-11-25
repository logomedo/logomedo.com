// Privitak dolazne poruke iz R2 (`SLIKE`, prefiks poruke/, privatno; odluka 6). Samo superadmin (rute.ts i ovdje).
// Zadano `attachment`; `?prikaz=1` za slike ugrađene u HTML poruke (iframe na /admin/uprava/poruke/[id]) je `inline`.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { smije } from "../../../../../lib/admin/ovlasti";
import { privitak } from "../../../../../lib/poruke";

const SLIKE_INLINE = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export const GET: APIRoute = async ({ params, locals, url }) => {
  const s = locals.admin;
  if (!s || !smije(s.uloga, "korisnici")) return new Response("Zabranjeno", { status: 403 });
  const id = Number(params.id);
  const p = Number.isInteger(id) && id > 0 ? await privitak(id) : null;
  if (!p?.r2_kljuc) return new Response("Nema privitka", { status: 404 });
  const o = await (env.SLIKE as R2Bucket).get(p.r2_kljuc);
  if (!o) return new Response("Nema privitka", { status: 404 });
  const inline = url.searchParams.get("prikaz") === "1" && SLIKE_INLINE.has(p.tip);
  const ime = p.ime.replace(/[\r\n"\\]/g, "_");
  const ascii = ime.replace(/[^\x20-\x7e]/g, "_");
  return new Response(o.body, {
    headers: {
      "content-type": p.tip || "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(ime)}`,
      "cache-control": "private, no-store",
    },
  });
};
