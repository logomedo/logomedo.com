// Rokovi obrasca /pristup na jednom mjestu, bez `cloudflare:workers`: koriste ih src/lib/pristup.ts (retencija)
// i prerenderirana /privatnost (src/landing/privatnost/Pristup.astro), pa tekst i kod ne mogu razići.

/** Rok čuvanja zahtjeva: neodgovoreni i odbijeni od slanja, odobreni najviše toliko od odobrenja. */
export const ROK_MJESECI = 6;
/** Nakon koliko sati se briše `ip_hash` (treba samo za limit po satu). */
export const IP_SATI = 24;
