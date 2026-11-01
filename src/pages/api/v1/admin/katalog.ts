import type { APIRoute } from "astro";
import { admin, greska } from "../../../../lib/app/api";
import { glasovi, stilIzUrla, stiloviAktivni, ukupno } from "../../../../lib/katalog";

/** Početni ekran: stilovi, glasovi s brojevima za odabrani stil (`?stil=`), ukupno. */
export const GET: APIRoute = async (ctx) => {
  if (!admin(ctx)) return greska("forbidden", 403);
  const s = await stilIzUrla(ctx.url);
  const [stilovi, g, u] = await Promise.all([stiloviAktivni(), glasovi(s.id), ukupno(s.id)]);
  return Response.json({ stil: s.kod, stilovi, glasovi: g, ukupno: u });
};
