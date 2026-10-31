import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { slug } from "../../../lib/fonemi";
import { rijeciPoId } from "../../../lib/zadaci/baza";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });

/** Nova riječ iz editora zadatka (npr. za rimu MIŠ–KIŠ). Bez glasa; slika se generira na stranici riječi. */
export const POST: APIRoute = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as { rijec?: unknown };
  const rijec = String(b.rijec ?? "").trim().toLocaleLowerCase("hr").replace(/\s+/g, " ");
  if (!rijec || rijec.length > 40 || !/^[a-zčćđšž -]+$/.test(rijec)) return json({ error: "Riječ smije imati samo slova (do 40)." }, 400);
  const r = await env.DB.prepare(
    "INSERT INTO rijeci (rijec, slug, izvor) VALUES (?, ?, 'admin') ON CONFLICT(rijec) DO UPDATE SET aktivna = 1 RETURNING id",
  ).bind(rijec, slug(rijec)).first<{ id: number }>();
  const [z] = await rijeciPoId([r!.id]);
  return json(z);
};
