// Vidljivost cjenika (var CJENIK_VIDLJIV u wrangler.jsonc): produkcija "false", staging "true". Landing je
// prerenderiran, pa se var čita pri buildu (prerender radi u workerd s env-om iz wrangler konfiguracije) i za
// promjenu treba redeploy, ne samo izmjena vara u dashboardu. "false" skriva /cijene (404), link u izborniku i
// podnožju, sitemap, linkove na cjenik u /uvjeti, /pristup i /admin/postavke te plaćene pakete s cijenom na /pristup.
import { env } from "cloudflare:workers";

export const cjenikVidljiv = (): boolean => env.CJENIK_VIDLJIV === "true";

/** Bez /cijene kad cjenik nije vidljiv (izbornik, podnožje, sitemap). */
export const bezSkrivenih = <T extends { href?: string; putanja?: string }>(popis: readonly T[]): T[] =>
  cjenikVidljiv() ? [...popis] : popis.filter((x) => (x.href ?? x.putanja) !== "/cijene");
