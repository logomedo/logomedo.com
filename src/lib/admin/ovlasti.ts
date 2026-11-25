// Uloge i ovlasti u adminu (docs/rbac/). Čisti TS, bez baze i bez `cloudflare:workers`.
// Superadmin je e-mail iz ADMIN_EMAILS; logoped je aktivan redak u `korisnici` (pozivnica).

export type Uloga = "superadmin" | "logoped";

export type Ovlast =
  /** Katalog: čitanje, nove riječi, slanje slika i izgovora na generiranje, odluke o svojima. */
  | "katalog"
  /** Uređivanje postojećeg kataloga: riječi (naziv, opis, pozicije, brisanje), glasovi, znakovi,
   * nepoželjne, situacije, snimke glasova, tuđe slike. */
  | "katalog.uredivanje"
  /** Svoji zadaci i bilježnice. */
  | "zadaci"
  /** AI generiranje (slike, zvukovi); logoped kroz tjednu kvotu. */
  | "ai"
  /** AI generiranje bez kvote. */
  | "ai.bez_limita"
  /** Tuđi zadaci i bilježnice. */
  | "sve.zadaci"
  /** Aktivnost drugih korisnika. */
  | "aktivnost.tudja"
  /** Popis korisnika, pozivnice, deaktivacija, limiti. */
  | "korisnici"
  /** Prompt, red, glasovi i probe glasova, prijava aplikacije, /api/v1. */
  | "administracija";

/** Matrica: tko smije što. */
export const OVLASTI = {
  katalog: { superadmin: true, logoped: true },
  "katalog.uredivanje": { superadmin: true, logoped: false },
  zadaci: { superadmin: true, logoped: true },
  ai: { superadmin: true, logoped: true },
  "ai.bez_limita": { superadmin: true, logoped: false },
  "sve.zadaci": { superadmin: true, logoped: false },
  "aktivnost.tudja": { superadmin: true, logoped: false },
  korisnici: { superadmin: true, logoped: false },
  administracija: { superadmin: true, logoped: false },
} as const satisfies Record<Ovlast, Record<Uloga, boolean>>;

export function smije(uloga: Uloga, ovlast: Ovlast): boolean {
  return OVLASTI[ovlast]?.[uloga] === true;
}

/**
 * Jedino mjesto pravila za ulogu. E-mail iz ADMIN_EMAILS je superadmin (redak se ne gleda);
 * inače logoped samo s retkom uloga = 'logoped' i aktivan = 1; sve ostalo nema pristup.
 */
export function odrediUlogu(
  email: string,
  adminEmails: Set<string>,
  red: { uloga: string; aktivan: number } | null,
): Uloga | null {
  if (adminEmails.has(email.trim().toLowerCase())) return "superadmin";
  if (red && red.uloga === "logoped" && red.aktivan === 1) return "logoped";
  return null;
}

/**
 * Tjedna AI kvota novog logopeda (pozivnica). Za alfu niže od zadanog u migraciji 0032 (50 / 200);
 * superadmin pojedincu podiže na /admin/uprava/korisnici (revizija 18. 11. 2026., ODLUKA 4).
 */
export const ZADANI_LIMIT = { slike: 20, zvukovi: 50 } as const;
