// Push za lokalni runner. Mac je iza NAT-a, pa runner sam otvara WebSocket prema
// /api/runner/zvono (jedan Durable Object, „runner”). Kad admin doda posao u red,
// Worker pozove zvoni() i runner se odmah budi. Hibernacija: dok nema poruka, DO ne troši ništa.
import { DurableObject, env } from "cloudflare:workers";

export class RunnerZvono extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keepalive runnera ne budi DO.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") !== "websocket") return new Response("Treba WebSocket", { status: 426 });
    const { 0: klijent, 1: posluzitelj } = new WebSocketPair();
    this.ctx.acceptWebSocket(posluzitelj);
    // Posao dodan između runnerovog „red je prazan” i spajanja ne smije se izgubiti.
    const ceka = await this.env.DB.prepare("SELECT 1 FROM generiranja WHERE status = 'ceka' LIMIT 1").first();
    if (ceka) posluzitelj.send("posao");
    return new Response(null, { status: 101, webSocket: klijent });
  }

  async zvoni(): Promise<number> {
    const svi = this.ctx.getWebSockets();
    for (const ws of svi) try { ws.send("posao"); } catch { /* zatvoren */ }
    return svi.length;
  }

  async spojeno(): Promise<number> {
    return this.ctx.getWebSockets().length;
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code === 1005 ? 1000 : code); } catch { /* već zatvoren */ }
  }
}

const zvono = () => env.RUNNER_ZVONO.getByName("runner");

/** Probudi runner. Greška ne smije srušiti dodavanje u red (runner ionako provjerava svakih 10 min). */
export async function zazvoni() {
  try { await zvono().zvoni(); } catch (e) { console.error("zvono:", e); }
}

/** Broj spojenih runnera (za stranicu Red). */
export async function spojenoRunnera(): Promise<number> {
  try { return await zvono().spojeno(); } catch { return 0; }
}
