// Sastavljanje konačnog prompta (bez ovisnosti o Workeru, da se može testirati).

/** Prompt posla + sistemski prompt (postavka `sistemski_prompt`), odvojeni praznim redom. */
export function spojiPrompt(prompt: string, sistemski: string | null | undefined): string {
  const s = sistemski?.trim();
  return s ? `${prompt.trim()}\n\n${s}` : prompt.trim();
}
