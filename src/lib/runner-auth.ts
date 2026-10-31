import { env } from "cloudflare:workers";
import { sha256Hex } from "./admin/sesija";

/** Bearer RUNNER_TOKEN za /api/runner/*. Usporedba preko hasha: jednaka duljina, bez ranog izlaza po znaku. */
export async function runnerOk(request: Request): Promise<boolean> {
  const dano = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const tajna = env.RUNNER_TOKEN;
  if (!dano || !tajna) return false;
  const [a, b] = await Promise.all([sha256Hex(dano), sha256Hex(tajna)]);
  let razlika = 0;
  for (let i = 0; i < a.length; i++) razlika |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return razlika === 0;
}
