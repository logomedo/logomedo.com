// Istoznačnice bez baze (migracija 0042): generator iz grupe riječi istog značenja uzima najviše jednu.

/**
 * Iz svake grupe istoznačnica ostaje jedna riječ, ostale se izbacuju (redoslijed ostalih se ne mijenja).
 * Prednost ima riječ koja ispunjava `prednost` (traženi glas), pa riječ sa slikom, inače slučajno.
 */
export function jednaPoGrupi<T extends { grupa?: number | null; slika?: string | null }>(
  rijeci: T[], rnd: () => number = Math.random, prednost?: (r: T) => boolean,
): T[] {
  const najbolja = new Map<number, [number, T]>();
  for (const r of rijeci) {
    if (r.grupa == null) continue;
    const ocjena = (prednost?.(r) ? 4 : 0) + (r.slika ? 2 : 0) + rnd();
    const b = najbolja.get(r.grupa);
    if (!b || ocjena > b[0]) najbolja.set(r.grupa, [ocjena, r]);
  }
  return rijeci.filter((r) => r.grupa == null || najbolja.get(r.grupa)![1] === r);
}
