// Probni Resend webhook na staging (docs/inbox/, S1): potpiše fixture `email.received` testnim Svix ključem i
// pošalje ga na /api/resend/webhook. Staging nema RESEND_API_KEY, pa se sprema samo metapodatak (tijelo_fali = 1).
//
//   RESEND_WEBHOOK_SECRET=whsec_… node scripts/inbox-probni-webhook.ts [https://staging.logomedo.com]
//
// Ključ je testni secret staginga (`wrangler secret put RESEND_WEBHOOK_SECRET --config wrangler.jsonc --env staging`),
// lokalno u ~/.cache/logomedo-staging/inbox-webhook-secret; nikad u git. Provjerava:
//   1. potpisan → 200 i id poruke; 2. nepotpisan → 401; 3. pogrešan potpis → 401; 4. isti email_id dvaput → duplikat.
// Red u staging D1 provjeri:
//   CLOUDFLARE_ACCOUNT_ID=7dc7167b7e2e00923bfa7cd697df14e4 npx wrangler d1 execute logomedo-staging --remote \
//     --config wrangler.jsonc --env staging --command "SELECT id, resend_id, tijelo_fali FROM poruke WHERE resend_id LIKE 'probni_%'"
// Fixture koristi samo adrese na primjer.test.
import { potpisi } from "../src/lib/svix.ts";

const tajna = process.env.RESEND_WEBHOOK_SECRET;
if (!tajna) {
  console.error("Nema RESEND_WEBHOOK_SECRET u okruženju.");
  process.exit(2);
}
const baza = (process.argv[2] ?? "https://staging.logomedo.com").replace(/\/+$/, "");
const url = `${baza}/api/resend/webhook`;
const emailId = `probni_${Date.now()}`;
const tijelo = JSON.stringify({
  type: "email.received",
  created_at: new Date().toISOString(),
  data: {
    email_id: emailId, created_at: new Date().toISOString(), from: "probni@primjer.test", to: ["odgovor+nepoznat0000000000@poruke.logomedo.com"],
    cc: [], bcc: [], received_for: [], message_id: `<${emailId}@primjer.test>`, subject: "Probni webhook (S1)",
    attachments: [{ id: "att_probni", filename: "probni.pdf", content_type: "application/pdf", content_disposition: "attachment", content_id: null }],
  },
});

async function posalji(oznaka: string, zaglavlja: Record<string, string>, ocekivano: number): Promise<unknown> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...zaglavlja }, body: tijelo });
  const j = await r.json().catch(() => null);
  const ok = r.status === ocekivano;
  console.log(`${ok ? "OK  " : "FAIL"} ${oznaka}: ${r.status} (očekivano ${ocekivano}) ${JSON.stringify(j)}`);
  if (!ok) process.exitCode = 1;
  return j;
}

async function potpisana(id: string): Promise<Record<string, string>> {
  const t = Math.floor(Date.now() / 1000);
  return { "svix-id": id, "svix-timestamp": String(t), "svix-signature": await potpisi(tajna!, id, t, tijelo) };
}

console.log(`${url}  email_id=${emailId}`);
const prvi = (await posalji("potpisan", await potpisana(`msg_${emailId}_1`), 200)) as { poruka?: number } | null;
if (!prvi?.poruka) { console.log("FAIL potpisan: nema id poruke"); process.exitCode = 1; }
await posalji("nepotpisan", {}, 401);
const krivi = await potpisana(`msg_${emailId}_2`);
await posalji("pogrešan potpis", { ...krivi, "svix-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" }, 401);
const drugi = (await posalji("isti email_id dvaput", await potpisana(`msg_${emailId}_3`), 200)) as { duplikat?: boolean } | null;
if (!drugi?.duplikat) { console.log("FAIL isti email_id: nije duplikat"); process.exitCode = 1; }
