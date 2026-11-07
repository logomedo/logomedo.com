#!/usr/bin/env bash
# Slike igre bilježnice (pozadine tema i stabla bez ukrasa) kroz Vertex, u stilu `ilustracija`.
# Jednokratno, ručno: ./scripts/igra-slike.sh <izlazni-dir> [ime ...]   (bez imena: sve)
# Plaća se (~$0,04 po slici). Sirove slike idu u <izlazni-dir>; u public/igra/ ih stavlja scripts/igra-obrada.py.
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

OPCE="Children's book illustration. No text, no letters, no people, no animals, no frame or border."
STABLO="One single tree, centered, filling the frame from top to bottom, the whole tree visible including the base of the trunk. Plain pure white background, nothing else around it: no ground, no grass, no snow on the ground, no shadow."
POZ="Background for a children's learning game: calm, soft, low contrast and low detail, so cards and a tree placed on top stay readable. No tree in the foreground."

declare -A P A
P[bor]="$OPCE $STABLO A Christmas fir tree with layered branches, a little snow on the branch tips and a golden star on top. NO ornaments, NO baubles, NO lights, NO garlands, NO presents."; A[bor]="4:5"
P[jabuka]="$OPCE $STABLO An apple tree with a big round full leafy green crown and a short brown trunk. NO apples, NO fruit, NO flowers on it."; A[jabuka]="4:5"
P[bozic-vodoravno]="$OPCE $POZ A quiet snowy winter village at dusk: soft blue and lilac evening sky with a few small stars, gentle snowy hills, a few small houses with warm glowing windows and small distant fir trees along the horizon in the lower third. The upper two thirds are mostly open sky."; A[bozic-vodoravno]="16:9"
P[bozic-uspravno]="${P[bozic-vodoravno]}"; A[bozic-uspravno]="9:16"
P[proljece-vodoravno]="$OPCE $POZ A sunny spring meadow: light blue sky with a few soft white clouds, a warm sun in the upper left corner, gentle rolling green hills in the lower third with small distant bushes, and tiny wildflowers in the grass at the bottom. The upper two thirds are mostly open sky."; A[proljece-vodoravno]="16:9"
P[proljece-uspravno]="${P[proljece-vodoravno]}"; A[proljece-uspravno]="9:16"

imena=("$@"); [[ ${#imena[@]} -eq 0 ]] && imena=(bor jabuka bozic-vodoravno bozic-uspravno proljece-vodoravno proljece-uspravno)
for ime in "${imena[@]}"; do
  ( VERTEX_ASPECT="${A[$ime]}" python3 "$KORIJEN/scripts/vertex-slika.py" "$IZLAZ/$ime" "${P[$ime]}" "${refs[@]}" 2>"$IZLAZ/$ime.err" \
      && echo "ok $ime" || echo "GREŠKA $ime: $(tail -1 "$IZLAZ/$ime.err")" ) &
  sleep 1
done
wait
