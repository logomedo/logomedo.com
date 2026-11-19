// Staging (docs/staging.md, landing odluka 207, zamjenjuje odluku 7). Kad je OKRUZENJE "staging", javni
// dio je otvoren kao na produkciji, a /admin štiti isti middleware kao na produkciji (Access + passkey,
// sesija). Svi odgovori staginga, i statičke datoteke (wrangler.jsonc env.staging
// assets.run_worker_first), nose x-robots-tag: noindex, da se kopija ne indeksira.
// Bez OKRUZENJE (produkcija) ova funkcija samo zove `dalje()`.

export interface StagingEnv {
  OKRUZENJE?: string;
}

function noindex(odgovor: Response): Response {
  // Odgovor iz fetcha/ASSETS-a ima nepromjenjiva zaglavlja; 101 (WebSocket) se ne dira.
  if (odgovor.status === 101) return odgovor;
  const r = new Response(odgovor.body, odgovor);
  r.headers.set("x-robots-tag", "noindex");
  return r;
}

export async function stagingVrata(
  request: Request,
  env: StagingEnv,
  dalje: () => Promise<Response>,
): Promise<Response> {
  if (env.OKRUZENJE !== "staging") return dalje();
  return noindex(await dalje());
}
