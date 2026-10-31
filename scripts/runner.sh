#!/usr/bin/env bash
# Lokalni runner za generiranje slika kataloga: uzima posao iz reda (/api/runner/uzmi),
# traži od `agy` (Antigravity CLI, Gemini) da nacrta sliku i vraća je (/api/runner/slika/:id).
#
#   scripts/runner.sh            # radi dok ga ne prekineš (Ctrl-C); prazan red = čeka 30 s
#   scripts/runner.sh --jednom   # jedan posao pa kraj (za probu)
#   scripts/runner.sh --prod     # produkcija: LOGOMEDO_URL i RUNNER_TOKEN iz .env.production (gitignored)
#
# Prazan red: runner ne pollira, nego čeka zvono (scripts/runner-cekaj.mjs, WebSocket na
# /api/runner/zvono). Worker zvoni kad admin doda posao; za svaki slučaj provjera i svakih 10 min.
# Trajno u pozadini: launchd (scripts/launchd/, docs/katalog.md).
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
# launchd nema nvm u PATH-u: uzmi najnoviji nvm node ako `node` nije dostupan.
NODE="${NODE:-$(command -v node || ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)}"
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

odgodi() {
    api -X POST -H "Content-Type: application/json" \
        -d "$(python3 -c 'import json,sys; print(json.dumps({"razlog": sys.argv[1]}))' "$2")" \
        "$URL/api/runner/odgodi/$1" >/dev/null || true
}

# Kvota alata za slike (429 RESOURCE_EXHAUSTED): agy javi i vrijeme reseta u UTC.
KVOTA_RE='RESOURCE_EXHAUSTED|quota exhaust'

# Koliko sekundi do reseta kvote. agy piše „reset at approximately 18:41 UTC” ili
# „reset in approximately 3 hours and 15 minutes”; bez ijednog 30 min. +2 min rezerve.
do_reseta() {
    tmux capture-pane -p -J -t "$SESSION" | python3 -c '
import re, sys, datetime as d
t = sys.stdin.read()
n = d.datetime.now(d.timezone.utc)
m = re.findall(r"(\d{1,2}):(\d{2}) UTC", t)
if m:
    h, mi = map(int, m[-1]); c = n.replace(hour=h, minute=mi, second=0, microsecond=0)
    if c <= n: c += d.timedelta(days=1)
    s = (c - n).total_seconds()
else:
    h = re.findall(r"(\d+)\s*hours?", t); mi = re.findall(r"(\d+)\s*minutes?", t)
    s = (int(h[-1]) * 3600 if h else 0) + (int(mi[-1]) * 60 if mi else 0) or 1800
print(int(s) + 120)'
}

# Slika je gotova kad postoji i veličina joj se dva puta zaredom ne promijeni.
# Izlaz 2: agy je javio potrošenu kvotu.
cekaj_datoteku() {
    local uzorak="$1" t0=$SECONDS prethodna=-1 f vel
    while (( SECONDS - t0 < TIMEOUT_S )); do
        sleep 4
        tmux capture-pane -p -J -t "$SESSION" | grep -qE "$KVOTA_RE" && return 2
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
    log "#$id $rijec → agy"
    t0=$SECONDS

    pitaj "/clear"; sleep 3
    pitaj "Generate exactly one image with your image generation tool, using this prompt verbatim: \"$prompt\" \
Save the generated image in the current directory as $ime.png (keep the original format's extension if it is not PNG). \
Do not edit, crop or post-process it, do not create any other files, and do not reply with anything except the file name."

    f="$(cekaj_datoteku "$W/$ime.*")" && rc=0 || rc=$?
    if (( rc == 2 )); then
        s="$(do_reseta)"
        log "⏸  #$id $rijec: kvota za slike potrošena, natrag u red; spavam $((s / 60)) min"
        odgodi "$id" "agy: kvota za slike potrošena (429), runner čeka reset"
        (( JEDNOM )) && exit 3
        sleep "$s"; continue
    fi
    if (( rc != 0 )); then
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
    slika_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("slikaId",""))' <<<"$rez" 2>/dev/null || true)"
    # SVG (potrace) samo za crno-bijelu bojanku; ilustracija u boji ostaje raster.
    if [[ -n "$slika_id" && "$stil" == "bojanka" ]]; then
        svg="$(LOGOMEDO_URL="$URL" RUNNER_TOKEN="$TOKEN" "$KORIJEN/scripts/svg.sh" "$slika_id" "$f" 2>&1)" \
            && log "#$id $rijec: svg → $svg" || log "⚠️  #$id: svg nije poslan: $svg"
    fi
    (( JEDNOM )) && exit 0
done
