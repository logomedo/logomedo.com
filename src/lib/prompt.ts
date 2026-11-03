// Sastavljanje konačnog prompta (bez ovisnosti o Workeru, da se može testirati).

/** Naslov bloka s ispravcima recenzenta. Po njemu `spojiPrompt` zna gdje počinje blok. */
export const ISPRAVCI = "REVIEWER CORRECTIONS";

/**
 * Komentari uz odbijene slike riječi kao upute koje model mora izvršiti. Do 3. 11. 2026. išli su
 * kao „Avoid: <komentar>”, pa je „Stavi strelicu na rep” značilo „izbjegni strelicu”, a sistemsko
 * pravilo „NOTHING EXTRA” (koje ide iza i „override anything else”) brisalo je auto u garaži i pastira.
 * Zato blok ide na sam kraj, iza sistemskog prompta, i izričito ima prednost.
 */
export function blokIspravaka(razlozi: string[]): string {
  const r = razlozi.map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (!r.length) return "";
  return [
    `${ISPRAVCI}. A speech therapist rejected earlier pictures of this word and wrote what was wrong and what to draw instead`,
    `(in Croatian, oldest first; when they differ, the last one wins). Apply every correction exactly.`,
    `They override all rules and style instructions above, including NOTHING EXTRA, "no scene" and the plain background:`,
    `if a correction asks for more objects, people, animals, a setting or a whole scene, draw them.`,
    `If a correction asks for an arrow ("strelica", "arrow pointer"), draw one simple bold arrow that clearly points at the named part.`,
    ...r.map((x) => `- ${x}`),
  ].join("\n");
}

/**
 * Prompt posla + sistemski prompt (postavka `sistemski_prompt`), odvojeni praznim redom.
 * Blok ispravaka iz prompta posla ide iza sistemskog prompta, da ga pravila ne nadjačaju.
 */
export function spojiPrompt(prompt: string, sistemski: string | null | undefined): string {
  const i = prompt.indexOf(`\n\n${ISPRAVCI}`);
  const [glavni, ispravci] = i < 0 ? [prompt, ""] : [prompt.slice(0, i), prompt.slice(i)];
  return [glavni.trim(), sistemski?.trim(), ispravci.trim()].filter(Boolean).join("\n\n");
}
