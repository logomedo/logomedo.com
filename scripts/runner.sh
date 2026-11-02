#!/usr/bin/env bash
# Lokalni runner za generiranje slika kataloga: uzima posao iz reda (/api/runner/uzmi),
# traži sliku od Vertex AI (Gemini image, scripts/vertex-slika.py) i vraća je (/api/runner/slika/:id).
#
#   scripts/runner.sh            # radi dok ga ne prekineš (Ctrl-C); prazan red = čeka zvono
#   scripts/runner.sh --jednom   # jedan posao pa kraj (za probu)
#   scripts/runner.sh --prod     # produkcija: LOGOMEDO_URL i RUNNER_TOKEN iz .env.production (gitignored)
#
# Prazan red: runner ne pollira, nego čeka zvono (scripts/runner-cekaj.mjs, WebSocket na
# /api/runner/zvono). Worker zvoni kad admin doda posao; za svaki slučaj provjera i svakih 10 min.
# Trajno u pozadini: launchd (scripts/launchd/, docs/katalog.md).
#
# Okolina:
#   LOGOMEDO_URL     default http://localhost:4321 (produkcija: https://logomedo.com)
#   RUNNER_TOKEN     default iz .dev.vars (produkcija: isti kao `wrangler secret put RUNNER_TOKEN`)
#   VERTEX_ACCOUNT   gcloud račun za token (obavezno; u .env.production/.dev.vars, gitignored)
#   VERTEX_PROJECT   default project-80b5a036-aed8-4b40-bd2
#   VERTEX_MODEL     default gemini-nano-banana-2.1 (VERTEX_THINKING LOW, VERTEX_ASPECT 1:1)
#   STIL_DIR         referentne slike stila, <STIL_DIR>/<stil>/*.jpg|png (default ~/git/.agy-logomedo/stil)
#   RADNI_DIR        gdje se spremaju slike (default ~/git/.agy-logomedo)
set -euo pipefail

KORIJEN="$(cd "$(dirname "$0")/.." && pwd)"
JEDNOM=0
for a in "$@"; do
    case "$a" in
        --jednom) JEDNOM=1 ;;
        --prod) set -a; source "$KORIJEN/.env.production"; set +a ;;
        *) echo "nepoznat argument: $a" >&2; exit 2 ;;
    esac
done
URL="${LOGOMEDO_URL:-http://localhost:4321}"
TOKEN="${RUNNER_TOKEN:-$(sed -n 's/^RUNNER_TOKEN=//p' "$KORIJEN/.dev.vars" 2>/dev/null || true)}"
export VERTEX_PROJECT="${VERTEX_PROJECT:-project-80b5a036-aed8-4b40-bd2}"
export VERTEX_MODEL="${VERTEX_MODEL:-gemini-nano-banana-2.1}"
VERTEX_ACCOUNT="${VERTEX_ACCOUNT:-$(sed -n 's/^VERTEX_ACCOUNT=//p' "$KORIJEN/.dev.vars" 2>/dev/null || true)}"
[[ -n "$VERTEX_ACCOUNT" ]] || { echo "Nema VERTEX_ACCOUNT (env, .env.production ili .dev.vars)" >&2; exit 2; }
W="${RADNI_DIR:-$HOME/git/.agy-logomedo}"
STIL_DIR="${STIL_DIR:-$W/stil}"
# launchd nema nvm ni google-cloud-sdk u PATH-u.
NODE="${NODE:-$(command -v node || ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)}"
GCLOUD="${GCLOUD:-$(command -v gcloud || echo "$HOME/google-cloud-sdk/bin/gcloud")}"
[[ -n "$TOKEN" ]] || { echo "Nema RUNNER_TOKEN (env ili .dev.vars)" >&2; exit 2; }
mkdir -p "$W"

log() { echo "[$(date +%H:%M:%S)] $*" >&2; }
api() { curl -sS -H "Authorization: Bearer $TOKEN" "$@"; }

# Google access token živi ~60 min, ali `gcloud auth print-access-token` vraća keširani
# token koji može isteći za par minuta (2.11.: 70 poslova palo na 401 13 min nakon starta).
# Zato se pita svakih 10 min, a na 401 odmah (rc 4).
VERTEX_TOKEN=""; TOKEN_T=-99999; TOKEN_401=0
vertex_token() {
    if (( SECONDS - TOKEN_T > 600 )); then
        VERTEX_TOKEN="$("$GCLOUD" auth print-access-token --account="$VERTEX_ACCOUNT")" \
            || { log "gcloud nema token za $VERTEX_ACCOUNT (gcloud auth login $VERTEX_ACCOUNT)"; exit 1; }
        TOKEN_T=$SECONDS
    fi
}

greska() {
    api -X POST -H "Content-Type: application/json" \
        -d "$(python3 -c 'import json,sys; print(json.dumps({"greska": sys.argv[1]}))' "$2")" \
        "$URL/api/runner/greska/$1" >/dev/null || true
}

odgodi() {
    api -X POST -H "Content-Type: application/json" \
        -d "$(python3 -c 'import json,sys; print(json.dumps({"razlog": sys.argv[1]}))' "$2")" \
        "$URL/api/runner/odgodi/$1" >/dev/null || true
}

vertex_token
log "runner: $URL, Vertex $VERTEX_MODEL na $VERTEX_PROJECT ($VERTEX_ACCOUNT)"
PAUZA=60   # nakon 429 ili 5xx; udvostručuje se do 30 min, uspjeh je vraća na 60 s

while true; do
    odgovor="$(api -X POST -w '\n%{http_code}' "$URL/api/runner/uzmi")"
    kod="${odgovor##*$'\n'}"; tijelo="${odgovor%$'\n'*}"
    if [[ "$kod" == "204" ]]; then
        (( JEDNOM )) && { log "red je prazan"; exit 0; }
        LOGOMEDO_URL="$URL" RUNNER_TOKEN="$TOKEN" "$NODE" "$KORIJEN/scripts/runner-cekaj.mjs" 600 || sleep 30
        continue
    fi
    [[ "$kod" == "200" ]] || { log "uzmi: HTTP $kod $tijelo"; exit 1; }

    id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$tijelo")"
    rijec="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["rijec"])' <<<"$tijelo")"
    prompt="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["prompt"])' <<<"$tijelo")"
    stil="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("stil",""))' <<<"$tijelo")"
    ime="posao-$id"
    rm -f "$W/$ime".*
    t0=$SECONDS

    # Referentne slike stila idu modelu kao uzor (samo stil, ne sadržaj).
    refs=()
    for x in "$STIL_DIR/$stil"/*.jpg "$STIL_DIR/$stil"/*.jpeg "$STIL_DIR/$stil"/*.png; do
        [[ -f "$x" ]] && refs+=("$x")
    done
    log "#$id $rijec → vertex (${#refs[@]} ref.)"

    vertex_token
    f="$(VERTEX_TOKEN="$VERTEX_TOKEN" python3 "$KORIJEN/scripts/vertex-slika.py" "$W/$ime" "$prompt" ${refs[@]+"${refs[@]}"} 2>"$W/$ime.err")" && rc=0 || rc=$?
    poruka="$(tail -1 "$W/$ime.err" 2>/dev/null || true)"; rm -f "$W/$ime.err"

    if (( rc == 4 )); then
        log "🔑 #$id $rijec: $poruka; novi token, posao natrag u red"
        odgodi "$id" "$poruka"; TOKEN_T=-99999
        (( JEDNOM )) && exit 3
        (( ++TOKEN_401 > 3 )) && { log "token i dalje 401, stajem (gcloud auth login $VERTEX_ACCOUNT)"; exit 1; }
        sleep 5; continue
    fi
    TOKEN_401=0
    if (( rc == 2 || rc == 3 )); then
        log "⏸  #$id $rijec: $poruka; natrag u red, spavam $((PAUZA / 60)) min"
        odgodi "$id" "$poruka"
        (( JEDNOM )) && exit 3
        sleep "$PAUZA"; PAUZA=$(( PAUZA * 2 > 1800 ? 1800 : PAUZA * 2 )); continue
    fi
    if (( rc != 0 )); then
        log "⚠️  #$id $rijec: $poruka"
        greska "$id" "$poruka"
        (( JEDNOM )) && exit 1; continue
    fi
    PAUZA=60
    mime="$(file -b --mime-type "$f")"
    if [[ "$mime" != image/* ]]; then
        greska "$id" "vertex: $f nije slika ($mime)"; log "⚠️  #$id: $mime"; (( JEDNOM )) && exit 1; continue
    fi
    rez="$(api -X PUT -H "Content-Type: $mime" -H "X-Model: $VERTEX_MODEL" --data-binary "@$f" "$URL/api/runner/slika/$id")"
    log "#$id $rijec: $(basename "$f") $(stat -f %z "$f") B, $((SECONDS - t0)) s, $poruka → $rez"
    slika_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("slikaId",""))' <<<"$rez" 2>/dev/null || true)"
    # SVG (potrace) samo za crno-bijelu bojanku; ilustracija u boji ostaje raster.
    if [[ -n "$slika_id" && "$stil" == "bojanka" ]]; then
        svg="$(LOGOMEDO_URL="$URL" RUNNER_TOKEN="$TOKEN" "$KORIJEN/scripts/svg.sh" "$slika_id" "$f" 2>&1)" \
            && log "#$id $rijec: svg → $svg" || log "⚠️  #$id: svg nije poslan: $svg"
    fi
    (( JEDNOM )) && exit 0
done
