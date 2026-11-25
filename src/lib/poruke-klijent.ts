// Brzi odgovori u obrascu odgovora na /admin/uprava/poruke/[id] (S3). Čisti TS bez DOM-a (testira se), a stranica ga
// uvozi iz <script> (Astro ga bundla; CSP nonce dodaje middleware, nema inline handlera).

export interface Umetanje { vrijednost: string; kursor: number }

/**
 * Ako neposredno prije kursora stoji `/kratica` (na početku teksta ili iza razmaka), zamijeni je tekstom brzog
 * odgovora. Inače null (Tab tada radi kao obično).
 */
export function umetniKraticu(vrijednost: string, kursor: number, kratice: ReadonlyMap<string, string>): Umetanje | null {
  const prije = vrijednost.slice(0, kursor);
  const m = prije.match(/(^|\s)\/([a-z0-9čćđšž_-]{1,30})$/i);
  if (!m) return null;
  const tekst = kratice.get(m[2].toLowerCase());
  if (tekst === undefined) return null;
  const pocetak = kursor - m[2].length - 1;
  return { vrijednost: vrijednost.slice(0, pocetak) + tekst + vrijednost.slice(kursor), kursor: pocetak + tekst.length };
}

/** Umetni tekst na mjesto označenog dijela (izbornik brzih odgovora); prazan red od postojećeg teksta. */
export function umetniNaKursor(vrijednost: string, od: number, do_: number, tekst: string): Umetanje {
  const prije = vrijednost.slice(0, od);
  const razmak = prije && !prije.endsWith("\n\n") ? (prije.endsWith("\n") ? "\n" : "\n\n") : "";
  const novo = prije + razmak + tekst;
  return { vrijednost: novo + vrijednost.slice(do_), kursor: novo.length };
}
