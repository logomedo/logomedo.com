// Pomoćno za /api/v1 (docs/app-api.md). Ugovor je JSON s hrvatskim imenima polja kao u bazi.
import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import type { AppSesija } from "./sesija";

/** Verzija ugovora: aplikacija je šalje u `x-logomedo-api`, a server je vraća u /api/v1/ja. */
export const API_VERZIJA = 1;
/** Najstarija verzija aplikacije (build broj) koju server još podržava; starija traži nadogradnju. */
export const MIN_BUILD_APLIKACIJE = 1;

export const greska = (poruka: string, status: number) => Response.json({ error: poruka }, { status });

/** Middleware je već provjerio; ovo je druga linija (npr. ako ruta postane dostupna mimo /api/v1/admin/ prefiksa). */
export function admin(ctx: Pick<APIContext, "locals">): AppSesija | null {
  const s = ctx.locals.app;
  return s?.uloga === "admin" ? s : null;
}

/** Slika za aplikaciju: privatna kroz API (bearer), odobrena i preko CDN-a (javno, edge cache). */
export function slikaUrl(s: { id: number; status: string; r2_kljuc: string }) {
  return {
    url: `/api/v1/admin/slike/${s.id}`,
    cdn: s.status === "odobrena" && env.CDN_URL ? `${env.CDN_URL}/${s.r2_kljuc}` : null,
  };
}
