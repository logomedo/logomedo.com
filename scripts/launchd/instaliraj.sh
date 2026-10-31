#!/usr/bin/env bash
# Instalira (ili ponovno učita) runner kao LaunchAgent. Uklanjanje: instaliraj.sh --ukloni
set -euo pipefail
KORIJEN="$(cd "$(dirname "$0")/../.." && pwd)"
CILJ="$HOME/Library/LaunchAgents/com.logomedo.runner.plist"
launchctl bootout "gui/$(id -u)/com.logomedo.runner" 2>/dev/null || true
if [[ "${1:-}" == "--ukloni" ]]; then rm -f "$CILJ"; echo "uklonjen"; exit 0; fi
sed -e "s#__KORIJEN__#$KORIJEN#g" -e "s#__HOME__#$HOME#g" "$KORIJEN/scripts/launchd/com.logomedo.runner.plist" > "$CILJ"
plutil -lint "$CILJ" >/dev/null
launchctl bootstrap "gui/$(id -u)" "$CILJ"
echo "pokrenut; log: ~/Library/Logs/logomedo-runner.log, status: launchctl print gui/$(id -u)/com.logomedo.runner | grep state"
