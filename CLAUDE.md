# logomedo.com

Aplikacija (Astro 7 + Cloudflare Workers + D1 + R2). Radni prostor iznad (`..`) ima i
`preuzimanje/` sa starim podacima; vidi `../CLAUDE.md`.

- Pravila i shema kataloga: `docs/katalog.md`. Admin prijava: `docs/admin.md`.
- `/api/v1` je API za Flutter aplikaciju (`../app`), samo bearer token: `docs/app-api.md`.
- `src/lib/admin/*` i `src/middleware.ts` su iz omm.domovina.ai; sigurnosne izmjene držati u skladu.
- Imena u kodu i UI-ju su hrvatska (kao u omm/e-satnici).
- Slike generira `scripts/runner.sh` (tmux + agy). Ne pokretati ga u petlji iz Claude
  sesije s notifikacijama po slici: jedna slika traje ~3 min, a katalog ima 428 riječi.
- Prije commita: `npm test && npm run check && npm run build`.
