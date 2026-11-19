# logomedo.com

Aplikacija (Astro 7 + Cloudflare Workers + D1 + R2). Radni prostor iznad (`..`) ima i
`preuzimanje/` sa starim podacima; vidi `../CLAUDE.md`.

- Pravila i shema kataloga: `docs/katalog.md`. Admin prijava: `docs/admin.md`.
- `/api/v1` je API za Flutter aplikaciju (`../app`), samo bearer token: `docs/app-api.md`.
- `src/lib/admin/*` i `src/middleware.ts` su iz omm.domovina.ai; sigurnosne izmjene držati u skladu.
- Imena u kodu i UI-ju su hrvatska (kao u omm/e-satnici).
- Slike generira `scripts/runner.sh` (Vertex AI, `gemini-nano-banana-2.1`). Ne pokretati ga u petlji iz Claude
  sesije s notifikacijama po slici: katalog ima 428 riječi, a Vertex se plaća.
- Izgovor (ElevenLabs) radi sam Worker kroz Cloudflare Queue, bez runnera: `docs/zvukovi.md`.
- Prije commita: `npm test && npm run check && npm run build`.
- Staging (`staging.logomedo.com`, kopija produkcijske D1 iza lozinke): `docs/staging.md`. Staging
  naredbe uvijek kroz `npm run …:staging` ili s `--config wrangler.jsonc --env staging`.

## Lanac: RBAC (logopedi, pozivnica, AI kvota)

Plan od 16. 11. 2026. u `docs/rbac/` (`TODO.md`, `plan.md`, `decisions.md`, `handoffs/`). „Nastavi RBAC”
znači prvi red koji nije „gotovo” u „Stanje lanca” u `docs/rbac/handoffs/README.md`; prompt je `SN.md`.

## Lanac: landing stranice + staging

Završeno 19. 11. 2026. (landing na produkciji, `docs/landing/`). Uređivanje sadržaja landinga: prompt
`docs/landing/handoffs/uredivanje-sadrzaja.md`; tekstovi u `docs/landing/sadrzaj.md` i `src/landing/`.
