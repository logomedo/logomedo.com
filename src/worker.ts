// Ulaz Workera: Astro handler, Durable Object za push runneru i consumer reda izgovora (ElevenLabs).
// /api/runner/zvono ide mimo Astra, jer odgovor 101 s WebSocketom mora proći netaknut.
import { handle } from "@astrojs/cloudflare/handler";
import { env } from "cloudflare:workers";
import { runnerOk } from "./lib/runner-auth";
import { obradi, type PorukaZvuka } from "./lib/zvukovi";
import { GreskaElevenLabs } from "./lib/elevenlabs";

export { RunnerZvono } from "./lib/runner-zvono";

export default {
  async fetch(request, e, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/runner/zvono") {
      if (!(await runnerOk(request))) return new Response("unauthorized", { status: 401 });
      return env.RUNNER_ZVONO.getByName("runner").fetch(request);
    }
    return handle(request, e, ctx);
  },

  // Poslovi jedan po jedan: ElevenLabs ograničava istodobne zahtjeve po planu.
  async queue(batch: MessageBatch) {
    for (const m of batch.messages) {
      try {
        await obradi((m.body as PorukaZvuka).posao);
        m.ack();
      } catch (e) {
        console.error(`zvuk posao ${(m.body as PorukaZvuka).posao}: ${e}`);
        const pauza = e instanceof GreskaElevenLabs && e.status === 429 ? 120 : 60;
        m.retry({ delaySeconds: pauza * Math.min(m.attempts, 5) });
      }
    }
  },
} satisfies ExportedHandler<Env>;
