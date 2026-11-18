// Vlasništvo zadataka, bilježnica i zapisa aktivnosti (docs/rbac/, odluke 8 i 9). Jedno mjesto koje iz
// sesije izvodi filtar; upiti u bazi ga primaju i u SQL-u rade `AND (?n IS NULL OR autor_id = ?n)`,
// pa tuđi zadatak ili bilježnica izgleda kao nepostojeći (404). Čisti TS, bez `cloudflare:workers`.
import type { Uloga } from "./ovlasti.ts";

/** null = superadmin (sve); broj = id logopeda u `korisnici` (samo njegovo). */
export type AutorFiltar = number | null;

type Tko = { uloga: Uloga; korisnikId: number | null; email: string };

/** Filtar za zadatke i bilježnice. Logoped bez retka ne postoji (odrediUlogu), pa baca umjesto da vidi sve. */
export function autorFiltar(s: Pick<Tko, "uloga" | "korisnikId">): AutorFiltar {
  if (s.uloga === "superadmin") return null;
  if (s.korisnikId == null) throw new Error("logoped bez retka u korisnici");
  return s.korisnikId;
}

/** Filtar za dnevnik aktivnosti: null = sve (superadmin); e-mail = samo njegovi zapisi, bez administracije. */
export function aktivnostFiltar(s: Pick<Tko, "uloga" | "email">): string | null {
  return s.uloga === "superadmin" ? null : s.email;
}

/**
 * Filtar za pregled slika i izgovora: null = sve (superadmin bez odabira), e-mail = samo ono što je
 * taj korisnik poslao. Logoped uvijek vidi samo svoje; superadmin može suziti na jednog korisnika.
 */
export function pregledFiltar(s: Pick<Tko, "uloga" | "email">, korisnik?: string | null): string | null {
  if (s.uloga === "superadmin") return korisnik?.trim().toLowerCase() || null;
  return s.email.trim().toLowerCase();
}
