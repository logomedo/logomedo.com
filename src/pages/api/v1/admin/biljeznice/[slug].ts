import type { APIRoute } from "astro";
import { admin, cdnZa, greska, slikePrikaz } from "../../../../../lib/app/api";
import { poSlugu, podaci } from "../../../../../lib/biljeznice";
import { ekrani } from "../../../../../lib/biljeznice-ekrani";
import { TEME } from "../../../../../lib/teme";

/**
 * Bilježnica za igru u aplikaciji: isti podaci kao /b/<slug> (zadaci, riječi s odobrenom
 * slikom, pozadine) i `ekrani` (već razloženi, kao u igri preglednika). Admin vidi i nejavne.
 */
export const GET: APIRoute = async (ctx) => {
  if (!admin(ctx)) return greska("forbidden", 403);
  const b = await poSlugu(String(ctx.params.slug));
  if (!b) return greska("not_found", 404);
  const p = await podaci(b);
  const tema = TEME[b.tema] ?? TEME.bozic;
  const { stil: _stil, ...biljeznica } = b;
  return Response.json({
    biljeznica: { ...biljeznica, javna: b.javna === 1 },
    tema: { kod: b.tema, naziv: tema.naziv, kraj: tema.kraj, boja: tema.boja },
    zadaci: p.zadaci,
    ekrani: ekrani(p.zadaci),
    ...slikePrikaz(p, cdnZa(ctx.url)),
  });
};
