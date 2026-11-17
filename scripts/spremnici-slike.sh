#!/usr/bin/env bash
# Spremnici za razvrstavanje (vreća, košara, kutija) kroz Vertex, u stilu `ilustracija`, kao okviri-slike.sh.
# Jednokratno, ručno: ./scripts/spremnici-slike.sh <izlazni-dir> [ime ...]   (bez imena: sve; N=2 kandidata po imenu)
# Plaća se (~$0,04 po slici). Prozirnu pozadinu, public/spremnici/*.png i položaj oznake radi scripts/spremnici-obrada.py.
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
N="${N:-2}"

# Oznaka (slovo ili broj) se piše preko slike u pregledniku i PDF-u, pa slika ima prazan bijeli krug na prednjoj strani.
OPCE="Soft watercolor children's book illustration of a single container that a child sorts picture cards into. Seen straight from the front, upright, centered, the whole object visible with some empty space around it. On the middle of its front there is one large, perfectly round, plain white empty label disc with a thin dark outline, about a third of the object's width, completely blank. Plain pure white background, nothing else: no ground, no shadow, no text, no letters, no numbers, no people, nothing inside or sticking out of the container."
declare -A P
P[vrece]="$OPCE A big red Santa Claus sack made of soft cloth, full and rounded, its neck gathered and tied with a golden ribbon bow on top."
P[kosare]="$OPCE A woven wicker basket in warm light brown with an arched handle over the top."
P[kutije]="$OPCE A sturdy light blue cardboard storage box with its lid open at the back, a small yellow strip of tape on the front edge."

imena=("$@"); [[ ${#imena[@]} -eq 0 ]] && imena=("${!P[@]}")
for ime in "${imena[@]}"; do
  for i in $(seq 1 "$N"); do
    ( VERTEX_ASPECT="1:1" python3 "$KORIJEN/scripts/vertex-slika.py" "$IZLAZ/$ime-$i" "${P[$ime]}" "${refs[@]}" 2>"$IZLAZ/$ime-$i.err" \
        && echo "ok $ime-$i" || echo "GREŠKA $ime-$i: $(tail -1 "$IZLAZ/$ime-$i.err")" ) &
    sleep 2
  done
done
wait
