// Secreti (wrangler secret put / .dev.vars), nisu u wrangler.jsonc pa ih `wrangler types` ne vidi.
declare namespace Cloudflare {
  interface Env {
    /** Bearer token lokalnog runnera (scripts/runner.sh) za /api/runner/*. */
    RUNNER_TOKEN: string;
    /** E-mailovi admina, zarezom odvojeni (secret: repo je javan). */
    ADMIN_EMAILS: string;
  }
}

declare namespace App {
  interface Locals {
    /** Prijavljeni admin, samo pod /admin (src/middleware.ts). */
    admin?: import("./lib/admin/sesija").Session;
    /** Prijavljena mobilna aplikacija, samo pod /api/v1 (bearer token). */
    app?: import("./lib/app/sesija").AppSesija;
  }
}
