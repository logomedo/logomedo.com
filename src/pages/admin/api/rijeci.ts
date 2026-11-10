import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { slug } from "../../../lib/fonemi";
import { rijeciPoId } from "../../../lib/zadaci/baza";
import { novaGrupa, sZapisom } from "../../../lib/aktivnost";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });

/** Nova riječ iz editora zadatka (npr. za rimu MIŠ–KIŠ). Bez glasa; slika se generira na stranici riječi. */
export const POST: APIRoute = async ({ request, locals }) => {
  const b = (await request.json().catch(() => ({}))) as { rijec?: unknown };
  const rijec = String(b.rijec ?? "").trim().toLocaleLowerCase("hr").replace(/\s+/g, " ");
  if (!rijec || rijec.length > 40 || !/^[a-zčćđšž -]+$/.test(rijec)) return json({ error: "Riječ smije imati samo slova (do 40)." }, 400);
  const znak = await env.DB.prepare("SELECT 1 FROM rijeci WHERE rijec = ? AND vrsta = 'znak'").bind(rijec).first();
  if (znak) return json({ error: `„${rijec}” je znak, ne riječ: odaberi ga među znakovima.` }, 409);
  const upis = await env.DB.batch(sZapisom(
    { tko: locals.admin!.email, radnja: "rijec.nova", tablica: "rijeci", grupa: novaGrupa() },
    { sql: "SELECT id FROM rijeci WHERE rijec = ?", args: [rijec] },
    [env.DB.prepare(
      "INSERT INTO rijeci (rijec, slug, izvor) VALUES (?, ?, 'admin') ON CONFLICT(rijec) DO UPDATE SET aktivna = 1 RETURNING id",
    ).bind(rijec, slug(rijec))],
  )).catch(() => null);
  const id = (upis?.[1].results[0] as { id: number } | undefined)?.id;
  if (!id) return json({ error: `Adresa „${slug(rijec)}” je već zauzeta drugom riječju.` }, 409);
  const [z] = await rijeciPoId([id]);
  return json(z);
};
