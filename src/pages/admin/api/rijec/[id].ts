import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { safeNext } from "../../../../lib/admin/sesija";
import { novaGrupa, sZapisom } from "../../../../lib/aktivnost";
import { preimenuj } from "../../../../lib/generiranje";

/** Opis za sliku, primjer rečenice i ručna rima; potvrda izvedene pozicije; novi naziv (i spajanje s postojećom). */
export const POST: APIRoute = async ({ request, params, locals }) => {
  const f = await request.formData();
  const id = Number(params.id);
  const t = (k: string) => { const v = String(f.get(k) ?? "").trim(); return v ? v.slice(0, 300) : null; };
  const akcija = f.get("akcija");
  const zapis = (radnja: string) => ({ tko: locals.admin!.email, radnja, tablica: "rijeci" as const, grupa: novaGrupa() });
  if (akcija === "preimenuj") {
    const od = safeNext(String(f.get("od") ?? ""));
    const stara = String(f.get("slug") ?? "");
    const na = (slug: string, q: Record<string, string>) =>
      `/admin/rijec/${slug}?${new URLSearchParams({ od, ...q })}`;
    const x = await preimenuj(id, String(f.get("naziv") ?? ""), locals.admin!.email, f.get("spoji") === "1");
    const kamo = x.ok
      ? na(x.slug, x.spojeno ? { spojeno: String(x.slika), zadataka: String(x.zadataka) } : { preimenovano: "1" })
      : x.postoji
        ? na(stara, { spoji: x.postoji.rijec, spoji_slika: String(x.postoji.slika) })
        : na(stara, { greska_naziva: x.greska ?? "Nije spremljeno." });
    return new Response(null, { status: 303, headers: { location: kamo } });
  }
  if (akcija === "potvrdi") {
    await env.DB.batch(sZapisom(zapis("rijec.glas_potvrden"), id, [env.DB.prepare(
      "UPDATE rijec_glas SET potvrdeno = 1 WHERE rijec_id = ? AND pozicija = ? AND glas_id = (SELECT id FROM glasovi WHERE slug = ?)",
    ).bind(id, String(f.get("pozicija")), String(f.get("glas")))]));
  } else if (akcija === "makni") {
    await env.DB.batch(sZapisom(zapis("rijec.glas_maknut"), id, [env.DB.prepare(
      "DELETE FROM rijec_glas WHERE rijec_id = ? AND pozicija = ? AND glas_id = (SELECT id FROM glasovi WHERE slug = ?)",
    ).bind(id, String(f.get("pozicija")), String(f.get("glas")))]));
  } else {
    const rima = t("rima")?.replace(/^-/, "").toLocaleUpperCase("hr").slice(0, 12) ?? null;
    await env.DB.batch(sZapisom(zapis("rijec.uredena"), id, [env.DB.prepare("UPDATE rijeci SET opis_za_sliku = ?, recenica = ?, rima = ? WHERE id = ?")
      .bind(t("opis_za_sliku"), t("recenica"), rima, id)]));
  }
  return new Response(null, { status: 303, headers: { location: safeNext(String(f.get("next") ?? "")) } });
};
