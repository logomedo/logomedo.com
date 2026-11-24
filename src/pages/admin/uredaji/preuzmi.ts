// „Odjavi taj i nastavi ovdje” (docs/uredaji.md). Middleware ovdje ne provjerava uređaj (BEZ_UREDAJA).
import type { APIRoute } from "astro";
import { preuzmi } from "../../../lib/admin/uredaji";
import { safeNext } from "../../../lib/admin/sesija";

export const POST: APIRoute = async ({ request, locals }) => {
  const s = locals.admin!;
  const f = await request.formData();
  const id = Number(f.get("id"));
  await preuzmi(request, s, Number.isInteger(id) && id > 0 ? id : null);
  return new Response(null, { status: 303, headers: { location: safeNext(String(f.get("nakon") ?? "")) } });
};
