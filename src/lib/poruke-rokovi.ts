// Rok čuvanja dopisivanja (inbox, docs/inbox/) na jednom mjestu, bez `cloudflare:workers`: koristi ga
// prerenderirana /privatnost (src/landing/privatnost/Dopisivanje.astro), a S4 retencija (razgovori, poruke, privitci
// u R2) mora čitati isti broj, pa tekst i kod ne mogu razići. Odluka 204 (potvrditi).

/** Razgovor (poruke i privitci) briše se toliko mjeseci nakon zadnje poruke u njemu. */
export const PORUKE_ROK_MJESECI = 24;
