// Čisti dio nepoželjnih riječi (bez baze), za testove i skripte.

/** Isto kao nova riječ: bez razmaka na rubovima, malim slovima, jedan razmak između riječi. */
export const normalizirajRijec = (rijec: string): string =>
  String(rijec ?? "").trim().toLocaleLowerCase("hr").replace(/\s+/g, " ").slice(0, 40);
