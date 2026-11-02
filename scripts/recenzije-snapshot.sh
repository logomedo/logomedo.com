#!/usr/bin/env bash
# Snimak recenzija slika iz produkcije u docs/prompt/recenzije/<datum>.md (docs/prompt-iteracije.md).
# Ulaz za sljedeću verziju sistemskog prompta: svaki komentar odbijene slike, uz verziju
# sistemskog prompta i predloška s kojom je slika nastala, i stopa odobrenja po verziji.
#
#   scripts/recenzije-snapshot.sh            # sve recenzije do sada
#   scripts/recenzije-snapshot.sh 2026-11-02 # samo pregledane od tog dana
#
# Repo je javan: u snimak ne ide e-mail ni ime recenzenta, samo riječ, odluka i komentar.
set -euo pipefail
KORIJEN="$(cd "$(dirname "$0")/.." && pwd)"
OD="${1:-2000-01-01}"
[[ "$OD" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "datum: YYYY-MM-DD" >&2; exit 2; }
DAN="$(date +%F)"
IZLAZ="$KORIJEN/docs/prompt/recenzije/$DAN.md"
mkdir -p "$(dirname "$IZLAZ")"
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT

cd "$KORIJEN"
CI=1 npx wrangler d1 execute logomedo --remote --json --command "
SELECT s.id, r.rijec, r.opis_za_sliku AS opis, st.kod AS stil, s.izvor, s.status, s.razlog, s.pregledano_at,
  vs.broj AS sistemski_v, vp.broj AS predlozak_v
FROM slike s
JOIN rijeci r ON r.id = s.rijec_id JOIN stilovi st ON st.id = s.stil_id
LEFT JOIN generiranja g ON g.slika_id = s.id
LEFT JOIN prompt_verzije vs ON vs.id = g.sistemski_verzija
LEFT JOIN prompt_verzije vp ON vp.id = g.predlozak_verzija
WHERE s.pregledano_at >= '$OD' AND s.status <> 'kandidat'
ORDER BY s.pregledano_at, s.id;
SELECT kljuc, broj, tekst, biljeska, created_at FROM prompt_verzije ORDER BY kljuc, broj;" > "$TMP"

python3 - "$TMP" "$IZLAZ" "$OD" "$DAN" <<'PY'
import collections, json, sys
podaci, izlaz, od, dan = sys.argv[1:]
slike, verzije = (r["results"] for r in json.load(open(podaci)))
v = lambda x, k: f"v{x[k]}" if x[k] else "–"
gen = [x for x in slike if x["izvor"] == "agy"]
o = [f"# Recenzije slika: snimak {dan}", "",
     f"Pregledane slike od {od}: {len(slike)} ({len(gen)} generiranih, {len(slike) - len(gen)} učitanih ručno).",
     "Izvor: produkcijski D1 (`scripts/recenzije-snapshot.sh`). Postupak: `docs/prompt-iteracije.md`.", "",
     "## Stopa odobrenja generiranih slika po verziji", "",
     "| stil | sistemski | predložak | odobreno | odbijeno | % |", "|---|---|---|---|---|---|"]
grupe = collections.defaultdict(lambda: [0, 0])
for x in gen:
    grupe[(x["stil"], v(x, "sistemski_v"), v(x, "predlozak_v"))][x["status"] == "odbijena"] += 1
for (st, s, p), (ok, ne) in sorted(grupe.items()):
    o.append(f"| {st} | {s} | {p} | {ok} | {ne} | {round(100 * ok / (ok + ne))} |")
o += ["", "„–” u stupcu sistemski: slika je nastala prije sistemskog prompta (agy, do 2. 11. 2026.).", "",
      "## Odbijene slike i komentari", "",
      "| # | riječ | stil | sistemski | predložak | pregledano | komentar |", "|---|---|---|---|---|---|---|"]
for x in slike:
    if x["status"] == "odbijena":
        kom = (x["razlog"] or "_(bez komentara)_").replace("|", "\\|").replace("\n", " ")
        o.append(f"| {x['id']} | {x['rijec']} | {x['stil']} | {v(x, 'sistemski_v')} | {v(x, 'predlozak_v')} | {x['pregledano_at'][:16]} | {kom} |")
o += ["", "## Verzije promptova u trenutku snimka", ""]
for z in verzije:
    o += [f"### {z['kljuc']} v{z['broj']} ({z['created_at'][:16]})", ""]
    if z["biljeska"]:
        o += [z["biljeska"], ""]
    o += ["```text", z["tekst"], "```", ""]
open(izlaz, "w").write("\n".join(o))
print(izlaz)
PY
