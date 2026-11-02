import type { APIRoute } from "astro";
import { admin, greska } from "../../../../lib/app/api";
import { popis } from "../../../../lib/zadaci/baza";

/** Svi zadaci (bez sadržaja), zadnje mijenjani prvi. */
export const GET: APIRoute = async (ctx) => {
  if (!admin(ctx)) return greska("forbidden", 403);
  return Response.json((await popis()).map((z) => ({
    id: z.id, vrsta: z.vrsta, naslov: z.naslov, uputa: z.uputa, verzija: z.aktivna_verzija, updated_at: z.updated_at,
  })));
};
