#!/bin/sh
# Build staginga u dist-staging/ (docs/staging.md). Produkcijski dist/ se ne dira, pa paralelni
# `npm run deploy` ne može pokupiti staging konfiguraciju.
# @cloudflare/vite-plugin pri buildu upiše .wrangler/deploy/config.json (redirect na zadnji build).
# Nakon staging builda vraćamo ga na dist/server (ili ga brišemo), da `wrangler` bez --config
# (npr. `npm run db:migrate`) nikad ne gađa staging konfiguraciju. Staging naredbe uvijek imaju
# --config i --env staging.
set -eu
cd "$(dirname "$0")/.."
CLOUDFLARE_ENV=staging npx astro build --outDir dist-staging
redirect=.wrangler/deploy/config.json
if [ -f dist/server/wrangler.json ]; then
  printf '%s' '{"configPath":"../../dist/server/wrangler.json","auxiliaryWorkers":[],"prerenderWorkerConfigPath":"../../dist/server/.prerender/wrangler.json"}' > "$redirect"
else
  rm -f "$redirect"
fi
grep -q '"targetEnvironment":"staging"' dist-staging/server/wrangler.json || { echo "dist-staging nije staging build" >&2; exit 1; }
