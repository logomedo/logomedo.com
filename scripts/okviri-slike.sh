#!/usr/bin/env bash
# Ukrasi okvira radnih listića (mašne i figurice za kutove) kroz Vertex, u stilu `ilustracija`.
# Jednokratno, ručno: ./scripts/okviri-slike.sh <izlazni-dir> [ime ...]   (bez imena: sve)
# Plaća se (~$0,04 po slici). Prozirnu pozadinu i public/okviri/*.png radi scripts/okviri-obrada.py.
((BASH_VERSINFO[0] >= 4)) || exec /opt/homebrew/bin/bash "$0" "$@"  # declare -A
set -euo pipefail
KORIJEN="$(cd "$(dirname "$0")/.." && pwd)"
IZLAZ="${1:?izlazni dir}"; shift || true
mkdir -p "$IZLAZ"
[[ -z "${VERTEX_ACCOUNT:-}" ]] && VERTEX_ACCOUNT="$(grep -h '^VERTEX_ACCOUNT=' "$KORIJEN/.dev.vars" | head -1 | cut -d= -f2-)"
export VERTEX_PROJECT="${VERTEX_PROJECT:-project-80b5a036-aed8-4b40-bd2}"
export VERTEX_TOKEN="$(gcloud auth print-access-token --account="$VERTEX_ACCOUNT")"
STIL="${STIL_DIR:-$HOME/git/.agy-logomedo/stil}/ilustracija"
refs=("$STIL"/*.jpg)

OPCE="Soft watercolor children's book illustration, a single small decorative sticker-like object for the corner of a printed worksheet. Centered, the whole object visible with some empty space around it. Plain pure white background, nothing else: no ground, no shadow, no frame or border, no text, no letters, no people."
declare -A P
P[masna-crvena]="$OPCE A big red satin Christmas bow with two ribbon tails, seen from the front, with a small sprig of fir needles behind it."
P[masna-zelena]="$OPCE A big green satin Christmas bow with two ribbon tails, seen from the front, with a small sprig of fir needles behind it."
P[medo]="$OPCE A cute sitting brown teddy bear wearing a red knitted scarf."
P[konjic]="$OPCE A wooden rocking horse toy, cream colored with a red saddle and red rockers, seen from the side."
P[medenjak]="$OPCE A gingerbread man cookie with white icing details and two red buttons."
P[grancica]="$OPCE A small fir branch with red berries and a few pine cones, horizontal."
P[drvce]="$OPCE A small decorated Christmas tree with colorful baubles, a garland and a golden star on top, in a little pot."
P[praporci]="$OPCE Two golden jingle bells tied together with a red ribbon bow and a sprig of holly."
P[snjegovic]="$OPCE A cheerful snowman with a red Santa hat, a carrot nose, coal buttons and a green scarf."
P[auto]="$OPCE A cute small red vintage car seen from the side, with a fir tree tied on the roof and wrapped Christmas presents visible through the windows."
P[vrtuljak]="$OPCE A small Christmas carousel with wooden horses, a red and white striped roof with a star on top, and tiny lights."
P[imela]="$OPCE A bunch of mistletoe with green leaves and white berries, tied with a small red ribbon."

imena=("$@"); [[ ${#imena[@]} -eq 0 ]] && imena=("${!P[@]}")
for ime in "${imena[@]}"; do
  ( VERTEX_ASPECT="1:1" python3 "$KORIJEN/scripts/vertex-slika.py" "$IZLAZ/$ime" "${P[$ime]}" "${refs[@]}" 2>"$IZLAZ/$ime.err" \
      && echo "ok $ime" || echo "GREŠKA $ime: $(tail -1 "$IZLAZ/$ime.err")" ) &
  sleep 2
done
wait
