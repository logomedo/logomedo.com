#!/usr/bin/env bash
# macOS obavijesti o napretku runnera, bez Claude sesije (ne troši kvotu): prati log i
# javlja svaku gotovu sliku, pauzu (kvota ili greška Vertexa), grešku i prazan red.
#
#   nohup scripts/runner-obavijesti.sh >/dev/null 2>&1 &     # zaustavi: pkill -f runner-obavijesti
set -uo pipefail
LOG="${1:-$HOME/Library/Logs/logomedo-runner.log}"
javi() { osascript -e "display notification \"${2//\"/}\" with title \"LogoMedo runner\" subtitle \"${1//\"/}\"" >/dev/null 2>&1; }

gotovo=0
tail -n0 -F "$LOG" 2>/dev/null | while IFS= read -r red; do
  case "$red" in
    *" B, "*" s → "*) gotovo=$((gotovo + 1)); javi "Slika #$gotovo gotova" "$(sed -E 's/^\[[^]]*\] //; s/:.*//' <<<"$red")" ;;
    *"natrag u red"*) javi "Pauza (Vertex)" "$(sed -E 's/.*spavam/spavam/' <<<"$red"), dosad $gotovo slika" ;;
    *"⚠️"*) javi "Greška" "$(sed -E 's/^\[[^]]*\] //' <<<"$red")" ;;
    *"red je prazan"*|*"uzmi: HTTP"*) javi "Runner" "$(sed -E 's/^\[[^]]*\] //' <<<"$red")" ;;
  esac
done
