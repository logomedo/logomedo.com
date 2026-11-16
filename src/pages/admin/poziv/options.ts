// Javno (middleware JAVNO), CSRF provjera Origina vrijedi. Tijelo: { token }. Odgovor:
// { ime, email, options } za otvorenu pozivnicu, inače jedna ista greška bez razloga.
import type { APIRoute } from "astro";
import { registrationOptions } from "../../../lib/admin/passkey";
import { provjeri } from "../../../lib/admin/pozivi";

export const POST: APIRoute = async ({ request, url }) => {
  const body = await request.json<{ token?: unknown }>().catch(() => null);
  const poziv = await provjeri(body?.token);
  if (!poziv) return Response.json({ error: "Pozivnica ne vrijedi. Zatraži novu." }, { status: 400 });
  const options = await registrationOptions(url, poziv.email, "poziv");
  return Response.json({ ime: poziv.ime, email: poziv.email, options });
};
