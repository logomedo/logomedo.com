#!/usr/bin/env bash
# Lokalni runner za generiranje slika kataloga: uzima posao iz reda (/api/runner/uzmi),
# traži od `agy` (Antigravity CLI, Gemini) da nacrta sliku i vraća je (/api/runner/slika/:id).
#
#   scripts/runner.sh            # radi dok ga ne prekineš (Ctrl-C); prazan red = čeka 30 s
#   scripts/runner.sh --jednom   # jedan posao pa kraj (za probu)
#   scripts/runner.sh --prod     # produkcija: LOGOMEDO_URL i RUNNER_TOKEN iz .env.production (gitignored)
#
# Okolina:
#   LOGOMEDO_URL   default http://localhost:4321 (produkcija: https://logomedo.com)
#   RUNNER_TOKEN   default iz .dev.vars (produkcija: isti kao `wrangler secret put RUNNER_TOKEN`)
#   AGY_MODEL      default gemini-3.8-flash-low
#
# Zašto tmux: `agy -p` pošalje zahtjev, ali odgovor nikad ne stigne na izlaz (bug od 1.3.5),
# radi samo interaktivni način. Uzorak je ~/.claude/scripts/agy_glasovna.sh.
# Radni direktorij mora biti „trusted” u agy-ju; ~/git je trusted roditelj, pa je ovdje
# ~/git/.agy-logomedo (izvan repoa). Gledanje: tmux attach -t logomedo-agy -r
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
MODEL="${AGY_MODEL:-gemini-3.8-flash-low}"
SESSION="${AGY_SESSION:-logomedo-agy}"
W="${AGY_DIR:-$HOME/git/.agy-logomedo}"
TIMEOUT_S="${AGY_TIMEOUT:-300}"
[[ -n "$TOKEN" ]] || { echo "Nema RUNNER_TOKEN (env ili .dev.vars)" >&2; exit 2; }
mkdir -p "$W"

log() { echo "[$(date +%H:%M:%S)] $*" >&2; }
api() { curl -sS -H "Authorization: Bearer $TOKEN" "$@"; }

pokreni_sesiju() {
    if tmux has-session -t "$SESSION" 2>/dev/null; then return; fi
    tmux new-session -d -s "$SESSION" -x 180 -y 50 -c "$W"
    tmux send-keys -t "$SESSION" "agy --model $MODEL --dangerously-skip-permissions" Enter
    for _ in $(seq 1 60); do
        sleep 1
        local ekran; ekran="$(tmux capture-pane -p -t "$SESSION")"
        if grep -qi "trust the contents" <<<"$ekran"; then tmux send-keys -t "$SESSION" Enter; continue; fi
        grep -q "for shortcuts" <<<"$ekran" && return
    done
    log "agy se nije pokrenuo (prijava? pokreni 'agy' u pravom terminalu). Ekran:"
    tmux capture-pane -p -t "$SESSION" | tail -12 >&2
    exit 1
}

pitaj() {
    tmux send-keys -t "$SESSION" -l "$1"
    sleep 0.5
    tmux send-keys -t "$SESSION" Enter
}

greska() {
    api -X POST -H "Content-Type: application/json" \
        -d "$(python3 -c 'import json,sys; print(json.dumps({"greska": sys.argv[1]}))' "$2")" \
        "$URL/api/runner/greska/$1" >/dev/null || true
}

# Slika je gotova kad postoji i veličina joj se dva puta zaredom ne promijeni.
cekaj_datoteku() {
    local uzorak="$1" t0=$SECONDS prethodna=-1 f vel
    while (( SECONDS - t0 < TIMEOUT_S )); do
        sleep 4
        f="$(ls -t $uzorak 2>/dev/null | head -1 || true)"
        [[ -n "$f" && -s "$f" ]] || continue
        vel=$(stat -f %z "$f")
        if [[ "$vel" == "$prethodna" ]]; then echo "$f"; return 0; fi
        prethodna=$vel
    done
    return 1
}

pokreni_sesiju
log "runner: $URL, model $MODEL, tmux $SESSION"

while true; do
    odgovor="$(api -X POST -w '\n%{http_code}' "$URL/api/runner/uzmi")"
    kod="${odgovor##*$'\n'}"; tijelo="${odgovor%$'\n'*}"
    if [[ "$kod" == "204" ]]; then
        (( JEDNOM )) && { log "red je prazan"; exit 0; }
        sleep 30; continue
    fi
    [[ "$kod" == "200" ]] || { log "uzmi: HTTP $kod $tijelo"; exit 1; }

    id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$tijelo")"
    rijec="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["rijec"])' <<<"$tijelo")"
    prompt="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["prompt"])' <<<"$tijelo")"
    ime="posao-$id"
    rm -f "$W/$ime".*
    log "#$id $rijec → agy"
    t0=$SECONDS

    pitaj "/clear"; sleep 3
    pitaj "Generate exactly one image with your image generation tool, using this prompt verbatim: \"$prompt\" \
Save the generated image in the current directory as $ime.png (keep the original format's extension if it is not PNG). \
Do not edit, crop or post-process it, do not create any other files, and do not reply with anything except the file name."

    if ! f="$(cekaj_datoteku "$W/$ime.*")"; then
        log "⚠️  #$id: nema slike nakon ${TIMEOUT_S}s"
        tmux send-keys -t "$SESSION" Escape; sleep 2; tmux send-keys -t "$SESSION" Escape
        greska "$id" "agy: nema slike nakon ${TIMEOUT_S}s"
        (( JEDNOM )) && exit 1; continue
    fi
    mime="$(file -b --mime-type "$f")"
    if [[ "$mime" != image/* ]]; then
        greska "$id" "agy: $f nije slika ($mime)"; log "⚠️  #$id: $mime"; (( JEDNOM )) && exit 1; continue
    fi
    rez="$(api -X PUT -H "Content-Type: $mime" --data-binary "@$f" "$URL/api/runner/slika/$id")"
    log "#$id $rijec: $(basename "$f") $(stat -f %z "$f") B, $((SECONDS - t0)) s → $rez"
    (( JEDNOM )) && exit 0
done
