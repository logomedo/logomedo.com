// Secreti (wrangler secret put / .dev.vars), nisu u wrangler.jsonc pa ih `wrangler types` ne vidi.
declare namespace Cloudflare {
  interface Env {
    /** Bearer token lokalnog runnera (scripts/runner.sh) za /api/runner/*. */
    RUNNER_TOKEN: string;
    /** E-mailovi admina, zarezom odvojeni (secret: repo je javan). */
    ADMIN_EMAILS: string;
    /** ElevenLabs (TTS + STT) za izgovor, docs/zvukovi.md. */
    ELEVENLABS_API_KEY: string;
    /** "staging" samo u env.staging (wrangler.jsonc); u produkciji nije postavljen. */
    OKRUZENJE?: string;
    /** Opcionalan: potpis vremenskog žiga i papar za ip_hash na /pristup (src/lib/pristup.ts). Bez njega žig je goli ms. */
    PRISTUP_TAJNA?: string;
    /** Resend (pozivnica e-poštom pri „Odobri”, src/lib/email.ts). Samo produkcija; bez njega se ne šalje ništa. */
    RESEND_API_KEY?: string;
    /** Svix tajni ključ (`whsec_…`) Resend webhooka /api/resend/webhook (docs/inbox/). Bez njega webhook vraća 503. */
    RESEND_WEBHOOK_SECRET?: string;
    /** Limit istovremenih uređaja (docs/uredaji.md): prazno = samo bilježi, "logoped" = provodi za logopede, "svi" = i superadmin. */
    UREDAJI_PROVEDBA?: string;
    /** domovina-fiskal (docs/naplata.md): URL okoline (var), API ključ ITalk tenanta i OIB operatera (secreti, OIB je osobni podatak). */
    FISKAL_URL?: string;
    FISKAL_API_KLJUC?: string;
    FISKAL_OPERATER_OIB?: string;
    /** Oznake poslovnog prostora i naplatnog uređaja u domovina-fiskal (var; zadano PP1 / 2). */
    FISKAL_PROSTOR?: string;
    FISKAL_UREDAJ?: string;
    /** "da" (samo staging): gumb „Simuliraj uplatu” na /admin/zahtjevi. */
    NAPLATA_SIMULACIJA?: string;
  }
}

declare namespace App {
  interface Locals {
    /** Prijavljeni admin, samo pod /admin (src/middleware.ts). */
    admin?: import("./lib/admin/sesija").Session;
    /** Prijavljena mobilna aplikacija, samo pod /api/v1 (bearer token). */
    app?: import("./lib/app/sesija").AppSesija;
    /** Račun je već otvoren na previše uređaja (middleware → rewrite na /admin/uredaji/previse). */
    previseUredaja?: Extract<import("./lib/admin/uredaji").Provjera, { ok: false }> & { nakon: string };
  }
}
