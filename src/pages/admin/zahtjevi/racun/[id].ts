// PDF računa uplate iz domovina-fiskala (docs/naplata.md). Pod /admin/zahtjevi, pa samo superadmin (rute.ts);
// API ključ fiskala ostaje na serveru.
import type { APIRoute } from "astro";
import { smije } from "../../../../lib/admin/ovlasti";
import { pdfRacuna } from "../../../../lib/admin/uplate";

export const GET: APIRoute = async ({ params, locals }) => {
  const s = locals.admin;
  if (!s || !smije(s.uloga, "korisnici")) return new Response("Zabranjeno", { status: 403 });
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Nema računa", { status: 404 });
  return (await pdfRacuna(id)) ?? new Response("Račun nije dostupan", { status: 404 });
};
