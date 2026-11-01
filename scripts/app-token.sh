#!/usr/bin/env bash
# Token mobilne aplikacije za LOKALNI D1 (wrangler dev), jer Access lokalno ne radi.
# Ispisuje token za polje „Dev token” u debug buildu aplikacije (docs/app-api.md).
# Uporaba: scripts/app-token.sh [email]   (zadano: prvi iz ADMIN_EMAILS u .dev.vars)
set -euo pipefail
cd "$(dirname "$0")/.."
EM="${1:-$(grep ^ADMIN_EMAILS .dev.vars | cut -d= -f2 | cut -d, -f1 | tr -d '"')}"
T=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
H=$(printf %s "$T" | shasum -a 256 | cut -d' ' -f1)
npx wrangler d1 execute logomedo --local --command "INSERT INTO app_sesije (token_hash,email,uredaj,created_at,expires_at,last_seen_at) VALUES ('$H','$EM','dev',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))" >/dev/null
echo "$T"
