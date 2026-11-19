// Resend webhook `email.received` → D1 i R2 (docs/inbox/, research/2026-11-19-resend-primanje.md §2).
// Ruta: src/pages/api/resend/webhook.ts. Redom: Svix potpis (RESEND_WEBHOOK_SECRET), samo `email.received`,
// idempotentno po `email_id`, dohvat tijela (`GET /emails/receiving/{id}`) i privitaka u R2, pa jedan batch u D1.
// Sve što može pasti (Resend API, R2) ide prije upisa u D1 i vraća 5xx, pa Svix ponovi; ponovljeni upis u R2 pod
// istim ključem je bezopasan. Bez RESEND_API_KEY (staging) spremaju se samo metapodaci, `tijelo_fali = 1`.
// Ne logira sadržaj ni adrese (osobni podaci), samo statuse.
import { env } from "cloudflare:workers";
import { provjeriPotpis } from "./svix";
import { messageIdovi, spremiDolaznu, type PrivitakZapis } from "./poruke";

const API = "https://api.resend.com";

/** Granice (odluka 103). Privitak izvan njih ostaje kao red bez `r2_kljuc`, s napomenom. */
export const PRIVITAK_MAX = 10 * 1024 * 1024;
export const PRIVITCI_UKUPNO_MAX = 25 * 1024 * 1024;
export const TEXT_MAX = 200_000;
export const HTML_MAX = 600_000;
export const DOPUSTENI_TIPOVI = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
  "application/pdf", "text/plain",
  "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/wav", "audio/x-wav", "audio/webm",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet",
]);

export const r2KljucPrivitka = (emailId: string, privitakId: string) => `poruke/${emailId}/${privitakId}`;

interface PrivitakMeta { id: string; filename?: string | null; content_type?: string | null; content_id?: string | null; size?: number | null; download_url?: string }
interface Primljeno {
  type?: string;
  data?: {
    email_id?: string; created_at?: string; from?: string; to?: string[]; cc?: string[]; received_for?: string[];
    message_id?: string; subject?: string; attachments?: PrivitakMeta[];
  };
}
interface DohvacenMail { text?: string | null; html?: string | null; headers?: Record<string, string | string[]> | null }

const json = (data: unknown, status = 200) => Response.json(data, { status });

class GreskaDohvata extends Error {}

const cistiTip = (t: string | null | undefined) => (t ?? "").split(";")[0].trim().toLowerCase() || "application/octet-stream";

function zaglavlje(h: DohvacenMail["headers"], ime: string): string | null {
  if (!h) return null;
  for (const [k, v] of Object.entries(h)) if (k.toLowerCase() === ime) return Array.isArray(v) ? v.join(" ") : v;
  return null;
}

async function resend<T>(f: typeof fetch, kljuc: string, put: string): Promise<T> {
  const r = await f(`${API}${put}`, { headers: { Authorization: `Bearer ${kljuc}` } });
  if (!r.ok) throw new GreskaDohvata(`resend ${r.status}`);
  return (await r.json()) as T;
}

async function popisPrivitaka(f: typeof fetch, kljuc: string, emailId: string): Promise<PrivitakMeta[]> {
  const svi: PrivitakMeta[] = [];
  let poslije = "";
  for (let i = 0; i < 10; i++) {
    const s = await resend<{ data?: PrivitakMeta[]; has_more?: boolean }>(
      f, kljuc, `/emails/receiving/${encodeURIComponent(emailId)}/attachments?limit=100${poslije ? `&after=${encodeURIComponent(poslije)}` : ""}`,
    );
    svi.push(...(s.data ?? []));
    if (!s.has_more || !s.data?.length) break;
    poslije = s.data.at(-1)!.id;
  }
  return svi;
}

/** Skini dopuštene privitke u R2. Vraća zapise za D1 (i za odbijene, bez `r2Kljuc`). */
async function spremiPrivitke(f: typeof fetch, emailId: string, popis: PrivitakMeta[]): Promise<PrivitakZapis[]> {
  const out: PrivitakZapis[] = [];
  let ukupno = 0;
  for (const p of popis) {
    const tip = cistiTip(p.content_type);
    const z: PrivitakZapis = { r2Kljuc: null, ime: (p.filename ?? "").trim() || "privitak", tip, velicina: p.size ?? null, contentId: p.content_id ?? null };
    if (!DOPUSTENI_TIPOVI.has(tip)) { out.push({ ...z, napomena: "tip nije dopušten" }); continue; }
    if ((p.size ?? 0) > PRIVITAK_MAX) { out.push({ ...z, napomena: "prevelik" }); continue; }
    if (ukupno + (p.size ?? 0) > PRIVITCI_UKUPNO_MAX) { out.push({ ...z, napomena: "prekoračena ukupna veličina" }); continue; }
    if (!p.download_url) throw new GreskaDohvata("privitak bez download_url");
    // download_url je potpisan URL (CloudFront), bez Resend ključa.
    const r = await f(p.download_url);
    if (!r.ok) throw new GreskaDohvata(`privitak ${r.status}`);
    const bajtovi = await r.arrayBuffer();
    if (bajtovi.byteLength > PRIVITAK_MAX || ukupno + bajtovi.byteLength > PRIVITCI_UKUPNO_MAX) {
      out.push({ ...z, velicina: bajtovi.byteLength, napomena: "prevelik" });
      continue;
    }
    ukupno += bajtovi.byteLength;
    const kljuc = r2KljucPrivitka(emailId, p.id);
    await (env.SLIKE as R2Bucket).put(kljuc, bajtovi, { httpMetadata: { contentType: tip } });
    out.push({ ...z, r2Kljuc: kljuc, velicina: bajtovi.byteLength });
  }
  return out;
}

function skrati(s: string | null | undefined, max: number): { v: string | null; skraceno: boolean } {
  if (s == null) return { v: null, skraceno: false };
  return s.length > max ? { v: s.slice(0, max), skraceno: true } : { v: s, skraceno: false };
}

/** Obradi webhook. `f` se ubacuje u testovima (bez mreže); `sada` u ms. */
export async function primiWebhook(request: Request, f: typeof fetch = fetch, sada: number = Date.now()): Promise<Response> {
  const tajna = env.RESEND_WEBHOOK_SECRET;
  if (!tajna) return json({ error: "webhook_nije_postavljen" }, 503);
  const tijelo = await request.text();
  const potpis = await provjeriPotpis(tajna, request.headers, tijelo, sada);
  if (!potpis.ok) return json({ error: "potpis", razlog: potpis.razlog }, 401);

  let dogadjaj: Primljeno;
  try {
    dogadjaj = JSON.parse(tijelo) as Primljeno;
  } catch {
    return json({ error: "json" }, 400);
  }
  if (dogadjaj.type !== "email.received") return json({ ok: true, preskoceno: String(dogadjaj.type ?? "") });
  const d = dogadjaj.data;
  if (!d?.email_id || !d.from) return json({ error: "nepotpun_dogadjaj" }, 400);
  const emailId = d.email_id;
  if (await (env.DB as D1Database).prepare("SELECT 1 FROM poruke WHERE resend_id = ?").bind(emailId).first()) {
    return json({ ok: true, duplikat: true });
  }

  const kljuc = env.RESEND_API_KEY;
  let mail: DohvacenMail = {};
  let privitci: PrivitakZapis[];
  try {
    if (kljuc) {
      // html_format=cid: ugrađene slike ostaju privitci (R2), HTML ne naraste preko granice reda D1.
      mail = await resend<DohvacenMail>(f, kljuc, `/emails/receiving/${encodeURIComponent(emailId)}?html_format=cid`);
      privitci = d.attachments?.length ? await spremiPrivitke(f, emailId, await popisPrivitaka(f, kljuc, emailId)) : [];
    } else {
      privitci = (d.attachments ?? []).map((p) => ({
        r2Kljuc: null, ime: (p.filename ?? "").trim() || "privitak", tip: cistiTip(p.content_type), velicina: p.size ?? null,
        contentId: p.content_id ?? null, napomena: "nije dohvaćen (nema RESEND_API_KEY)",
      }));
    }
  } catch (e) {
    if (e instanceof GreskaDohvata) {
      console.error(`inbox webhook: dohvat nije uspio (${e.message})`);
      return json({ error: "dohvat" }, 502);
    }
    throw e;
  }

  const text = skrati(mail.text, TEXT_MAX);
  const html = skrati(mail.html, HTML_MAX);
  const napomene = [text.skraceno && "tekst skraćen", html.skraceno && "HTML predug, nije spremljen"].filter(Boolean);
  const inReplyTo = zaglavlje(mail.headers, "in-reply-to");
  const odZaglavlje = zaglavlje(mail.headers, "from");
  const ishod = await spremiDolaznu({
    resendId: emailId,
    messageId: d.message_id ?? null,
    inReplyTo: messageIdovi(inReplyTo)[0] ?? null,
    reference: messageIdovi(zaglavlje(mail.headers, "references"), inReplyTo),
    od: odZaglavlje && odZaglavlje.includes("<") ? odZaglavlje : d.from,
    za: [...(d.to ?? []), ...(d.cc ?? []), ...(d.received_for ?? [])],
    predmet: d.subject ?? null,
    text: text.v,
    html: html.skraceno ? null : html.v,
    tijeloFali: !kljuc,
    napomena: napomene.length ? napomene.join("; ") : null,
    privitci,
    createdAt: d.created_at ?? new Date(sada).toISOString(),
  });
  return ishod.nova ? json({ ok: true, poruka: ishod.porukaId, razgovor: ishod.razgovorId }) : json({ ok: true, duplikat: true });
}
