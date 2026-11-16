// Zamjena za `cloudflare:workers` u testovima (registracija.ts je podmeće pri importu).
// `env` je običan objekt: test postavlja `env.DB = napraviD1()`, `env.ADMIN_EMAILS = "a@primjer.hr"`.
export const env: Record<string, any> = {};

/** Prazna, da `class X extends DurableObject` (runner-zvono.ts) uopće može nastati. */
export class DurableObject<E = unknown> {
  ctx: unknown;
  env: E;
  constructor(ctx: unknown, env: E) {
    this.ctx = ctx;
    this.env = env;
  }
}
