// Ulaz Workera: Astro handler + Durable Object za push runneru.
// /api/runner/zvono ide mimo Astra, jer odgovor 101 s WebSocketom mora proći netaknut.
import { handle } from "@astrojs/cloudflare/handler";
import { env } from "cloudflare:workers";
import { runnerOk } from "./lib/runner-auth";

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
} satisfies ExportedHandler<Env>;
