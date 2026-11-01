import type { APIRoute } from "astro";
import { izdajKod } from "../../../lib/app/sesija";

/** Shema aplikacije (Android intent-filter, iOS URL type). Fiksna: nikad iz zahtjeva. */
export const APP_POVRATAK = "com.logomedo.app://prijava";

/** Admin je u pregledniku potvrdio prijavu aplikacije: jednokratni kod (2 min) vezan uz PKCE izazov. */
export const POST: APIRoute = async ({ request, locals }) => {
  const b = (await request.json().catch(() => ({}))) as { izazov?: unknown; uredaj?: unknown };
  const kod = await izdajKod(locals.admin!.email, String(b.izazov ?? ""), b.uredaj);
  if (!kod) return Response.json({ error: "izazov" }, { status: 400 });
  return Response.json({ povratak: `${APP_POVRATAK}?kod=${encodeURIComponent(kod)}` });
};
