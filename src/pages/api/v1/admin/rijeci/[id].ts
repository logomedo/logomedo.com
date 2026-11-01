import type { APIRoute } from "astro";
import { admin, greska, slikaUrl } from "../../../../../lib/app/api";
import { rijec } from "../../../../../lib/katalog";

/** Detalj riječi po slugu: pozicije, sve slike (s URL-om), poslovi u redu. */
export const GET: APIRoute = async (ctx) => {
  if (!admin(ctx)) return greska("forbidden", 403);
  const r = await rijec(String(ctx.params.id));
  if (!r) return greska("not_found", 404);
  return Response.json({ ...r, slike: r.slike.map(({ r2_kljuc, ...s }) => ({ ...s, ...slikaUrl({ ...s, r2_kljuc }) })) });
};
