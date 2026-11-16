// Javno (middleware JAVNO), CSRF provjera Origina vrijedi. Tijelo: { token, response, label? }.
// Izazov (namjena 'poziv', e-mail pozivnice) → WebAuthn provjera → jedan batch: pozivnica potrošena,
// korisnik aktivan logoped, passkey upisan (pozivi.ts) → sesija `method='poziv'` (odluka 5).
// Svaki neuspjeh vani izgleda isto.
import type { APIRoute } from "astro";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { provjeriRegistraciju } from "../../../lib/admin/passkey";
import { iskoristi, provjeri } from "../../../lib/admin/pozivi";
import { startSession } from "../../../lib/admin/sesija";

const NEUSPJEH = "Pozivnica ne vrijedi ili passkey nije upisan. Otvori link ponovno ili zatraži novu pozivnicu.";
const ne = () => Response.json({ error: NEUSPJEH }, { status: 400 });

export const POST: APIRoute = async ({ request, url }) => {
  const body = await request.json<{ token?: unknown; response?: RegistrationResponseJSON; label?: unknown }>().catch(() => null);
  if (!body?.response?.id || typeof body.token !== "string") return ne();
  const poziv = await provjeri(body.token);
  if (!poziv) return ne();
  // Izazov se troši ovdje i mora biti izdan za e-mail ove pozivnice (provjeriRegistraciju).
  const kljuc = await provjeriRegistraciju(url, poziv.email, body.response, "poziv");
  if (!kljuc) return ne();
  const label = typeof body.label === "string" ? body.label : "";
  const iskoristena = await iskoristi(body.token, kljuc, label).catch((e) => {
    console.error(JSON.stringify({ msg: "poziv_batch_greska", greska: String((e as Error).message ?? e).slice(0, 200) }));
    return null;
  });
  if (!iskoristena) return ne();
  console.warn(JSON.stringify({ msg: "admin_poziv_iskoristen", poziv: iskoristena.id, email: iskoristena.email }));
  return startSession(request, iskoristena.email, "poziv", "/admin", true);
};
