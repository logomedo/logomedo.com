// Lagani potpis stanja inboxa za praćenje novih poruka (odluka 313): `?razgovor=<id>` za nit, inače cijeli popis.
// Samo superadmin (rute.ts i ovdje). Bez sadržaja poruka; middleware postavlja `cache-control: no-store`.
import type { APIRoute } from "astro";
import { smije } from "../../../../lib/admin/ovlasti";
import { potpisPoruka } from "../../../../lib/poruke";

export const GET: APIRoute = async ({ locals, url }) => {
  const s = locals.admin;
  if (!s || !smije(s.uloga, "korisnici")) return new Response("Zabranjeno", { status: 403 });
  const r = Number(url.searchParams.get("razgovor"));
  const potpis = await potpisPoruka(Number.isInteger(r) && r > 0 ? r : undefined);
  return new Response(JSON.stringify({ potpis }), { headers: { "content-type": "application/json" } });
};
