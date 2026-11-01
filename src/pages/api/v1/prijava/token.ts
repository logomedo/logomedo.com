import type { APIRoute } from "astro";
import { greska } from "../../../../lib/app/api";
import { zamijeniKod } from "../../../../lib/app/sesija";

/** Jednokratni kod iz preglednika + PKCE verifikator → bearer token (30 dana, 7 dana neaktivnosti). */
export const POST: APIRoute = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as { kod?: unknown; verifikator?: unknown };
  const r = await zamijeniKod(b.kod, b.verifikator);
  if (!r) return greska("invalid_grant", 400);
  return Response.json(r);
};
