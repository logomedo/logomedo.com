import type { APIRoute } from "astro";
import { admin, cdnZa, greska, slikePrikaz } from "../../../../../lib/app/api";
import { rijeciIPozadine } from "../../../../../lib/biljeznice";
import { ekrani } from "../../../../../lib/biljeznice-ekrani";
import { zadatak } from "../../../../../lib/zadaci/baza";

/** Jedan zadatak za pregled u aplikaciji („Dijete rješava”): aktivna verzija, riječi, pozadine. */
export const GET: APIRoute = async (ctx) => {
  if (!admin(ctx)) return greska("forbidden", 403);
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) return greska("not_found", 404);
  const z = await zadatak(id);
  if (!z) return greska("not_found", 404);
  const zz = { id: z.id, vrsta: z.vrsta, naslov: z.naslov, uputa: z.uputa, verzija: z.aktivna_verzija, sadrzaj: z.sadrzaj };
  return Response.json({ zadatak: zz, ekrani: ekrani([z]), ...slikePrikaz(await rijeciIPozadine([z], "ilustracija"), cdnZa(ctx.url)) });
};
