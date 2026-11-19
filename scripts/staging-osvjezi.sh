#!/bin/bash
# Kopija produkcijske D1 u staging (docs/staging.md, landing odluka 5). Ručno, ne po rasporedu.
# 1. staging D1: DROP svih tablica (dijete → roditelj), shema iz migracija ove kopije
#    (`npm run db:migrate:staging`), pa DELETE svih redaka (i onih koje upišu migracije)
# 2. `wrangler d1 export logomedo --remote --no-schema` (samo čitanje produkcije; export za svog
#    trajanja blokira produkcijsku bazu, izmjereno u
#    docs/landing/research/2026-11-19-astro-cloudflare-okruzenja.md) i import u staging.
#    Puni dump (shema + podaci) se ne može importati: tablice idu redom nastanka, a INSERT u
#    `stilovi` referencira `prompt_verzije` koja još ne postoji („no such table”).
# 3. dump se briše; nikad u repo (sadrži e-mailove i podatke logopeda)
# 4. broj redaka ključnih tablica: staging i produkcija (čitanje)
# Sesije i passkeyevi s produkcije na stagingu ne vrijede (rpID); prijava: scripts/staging-sesija.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
export CLOUDFLARE_ACCOUNT_ID=7dc7167b7e2e00923bfa7cd697df14e4
W="npx wrangler"
STG=(--remote --config wrangler.jsonc --env staging)
# Produkcija se samo čita; --config wrangler.jsonc da redirect iz builda ne odluči umjesto nas.
PROD=(--remote --config wrangler.jsonc)
DIR="$HOME/.cache/logomedo-staging"
mkdir -p "$DIR"; chmod 700 "$DIR"
DUMP="$DIR/prod-$(date +%Y%m%d-%H%M%S).sql"
ISPRAZNI="$DIR/isprazni-$$.sql"
trap 'rm -f "$DUMP" "$DUMP.red" "$ISPRAZNI" "$DIR/shema-$$.json"' EXIT

SHEMA="$DIR/shema-$$.json"
shema() {
  $W d1 execute logomedo-staging "${STG[@]}" --json --command \
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'" > "$SHEMA"
}
# Redoslijed tablica (FK), brisanje i slaganje dumpa: src/lib/staging-dump.ts (testovi uz njega).
DUMPLIB="node src/lib/staging-dump.ts"

echo "== pražnjenje staginga (DROP svih tablica, dijete → roditelj)"
shema
$DUMPLIB drop "$SHEMA" > "$ISPRAZNI"
if [ "$(wc -l < "$ISPRAZNI")" -gt 1 ]; then $W d1 execute logomedo-staging "${STG[@]}" --yes --file "$ISPRAZNI" >/dev/null; fi

echo "== shema staginga (migracije ove kopije)"
npm run -s db:migrate:staging >/dev/null </dev/null
# Migracije same upisuju retke (glasovi, stilovi, prompt_verzije…): sve tablice se isprazne, dijete → roditelj,
# osim d1_migrations, koja ostaje staginga (dump produkcije je ne puni; src/lib/staging-dump.ts).
shema
$DUMPLIB brisanje "$SHEMA" > "$ISPRAZNI"
$W d1 execute logomedo-staging "${STG[@]}" --yes --file "$ISPRAZNI" >/dev/null

echo "== export produkcije, samo podaci (blokira produkcijsku D1 dok traje)"
t0=$(date +%s)
$W d1 export logomedo "${PROD[@]}" --no-schema --output "$DUMP" >/dev/null
echo "export: $(( $(date +%s) - t0 )) s, $(wc -c < "$DUMP" | tr -d ' ') B"
chmod 600 "$DUMP"

# Roditelj → dijete i NULL za strane ključeve prema nepostojećoj tablici (src/lib/staging-dump.ts).
$DUMPLIB slozi "$SHEMA" "$DUMP" > "$DUMP.red"
mv "$DUMP.red" "$DUMP"

echo "== import u staging"
t2=$(date +%s)
$W d1 execute logomedo-staging "${STG[@]}" --yes --file "$DUMP" >/dev/null
echo "import: $(( $(date +%s) - t2 )) s"
rm -f "$DUMP"

echo "== broj redaka (staging | produkcija)"
UPIT="SELECT (SELECT count(*) FROM rijeci) rijeci, (SELECT count(*) FROM slike) slike, (SELECT count(*) FROM korisnici) korisnici, (SELECT count(*) FROM admin_sessions) admin_sessions, (SELECT count(*) FROM app_sesije) app_sesije, (SELECT count(*) FROM zadaci) zadaci, (SELECT count(*) FROM d1_migrations) d1_migrations"
broj() { $W d1 execute "$1" "${@:2}" --json --command "$UPIT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s)[0].results[0])))'; }
echo "staging:    $(broj logomedo-staging "${STG[@]}")"
echo "produkcija: $(broj logomedo "${PROD[@]}")"
