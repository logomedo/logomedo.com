import type { APIRoute } from "astro";
import { API_VERZIJA, MIN_BUILD_APLIKACIJE } from "../../../lib/app/api";

/** Tko sam i što server podržava. Aplikacija ga zove pri pokretanju. */
export const GET: APIRoute = ({ locals }) => {
  const s = locals.app!;
  return Response.json({ email: s.email, uloga: s.uloga, uredaj: s.uredaj, istjece: s.expiresAt, api: API_VERZIJA, min_build: MIN_BUILD_APLIKACIJE });
};
