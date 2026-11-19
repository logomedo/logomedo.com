#!/bin/bash
# Admin sesija na stagingu bez Accessa i passkeya (docs/staging.md, landing odluka 8).
# Upisuje sesiju u staging D1 (kao „Lokalno” u docs/admin.md) i ispisuje kolačić.
#   scripts/staging-sesija.sh <email> [--superadmin]
# Uloga se računa kao na produkciji: superadmin iz secreta ADMIN_EMAILS (staging ima svoj),
# logoped iz tablice korisnici (kopija produkcije). --superadmin postavi ADMIN_EMAILS staginga na
# točno taj e-mail (prepiše prethodni popis). E-mail je argument, nikad u repou.
set -euo pipefail
cd "$(dirname "$0")/.."
EMAIL="${1:?upotreba: scripts/staging-sesija.sh <email> [--superadmin]}"
EMAIL=$(printf %s "$EMAIL" | tr '[:upper:]' '[:lower:]')
[[ "$EMAIL" =~ ^[^\'\"[:space:]]+@[^\'\"[:space:]]+$ ]] || { echo "neispravan e-mail" >&2; exit 1; }
export CLOUDFLARE_ACCOUNT_ID=7dc7167b7e2e00923bfa7cd697df14e4
STG=(--remote --config wrangler.jsonc --env staging)
if [ "${2:-}" = "--superadmin" ]; then
  printf %s "$EMAIL" | npx wrangler secret put ADMIN_EMAILS --config wrangler.jsonc --env staging >/dev/null
  echo "ADMIN_EMAILS staginga = taj e-mail"
fi
T=$(openssl rand -hex 24); H=$(printf %s "$T" | shasum -a 256 | cut -d' ' -f1)
npx wrangler d1 execute logomedo-staging "${STG[@]}" --command "INSERT INTO admin_sessions (token_hash,email,method,created_at,expires_at,last_seen_at) VALUES ('$H','$EMAIL','access',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+12 hours'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))" >/dev/null
echo "__Host-logomedo_admin=$T"
echo "# vrijedi 12 h, npr.:"
echo "# curl -b '__Host-logomedo_admin=$T' https://staging.logomedo.com/admin"
