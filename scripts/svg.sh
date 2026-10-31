#!/usr/bin/env bash
# Vektorizira bojanku (potrace) i šalje SVG uz postojeću sliku: scripts/svg.sh <slika_id> <datoteka>
# Runner ga zove nakon svake slike. Okolina kao runner: LOGOMEDO_URL, RUNNER_TOKEN (ili --prod).
# Potrebno: brew install potrace imagemagick
set -euo pipefail
KORIJEN="$(cd "$(dirname "$0")/.." && pwd)"
[[ "${1:-}" == "--prod" ]] && { set -a; source "$KORIJEN/.env.production"; set +a; shift; }
ID="$1"; ULAZ="$2"
URL="${LOGOMEDO_URL:-http://localhost:4321}"
TOKEN="${RUNNER_TOKEN:-$(sed -n 's/^RUNNER_TOKEN=//p' "$KORIJEN/.dev.vars" 2>/dev/null || true)}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
# Prag 50 %: linije su crne, podloga bijela; turdsize 4 miče JPEG mrlje, alphamax 1 = glatke krivulje.
magick "$ULAZ" -colorspace gray -threshold 50% "$T/a.pbm"
potrace "$T/a.pbm" -s --turdsize 4 --alphamax 1 -o "$T/a.svg"
curl -sS -f -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: image/svg+xml" \
    --data-binary "@$T/a.svg" "$URL/api/runner/svg/$ID"
