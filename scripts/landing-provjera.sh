#!/usr/bin/env bash
# Provjera landinga na živom hostu (landing odluka 13, docs/landing/plan.md S3): samo GET/HEAD, bez prijave i lozinki.
#   ./scripts/landing-provjera.sh staging.logomedo.com
#   ./scripts/landing-provjera.sh http://localhost:8787     (npm run build && npx wrangler dev --config dist/server/wrangler.json)
# Jedan redak po provjeri (OK / GREŠKA), na kraju zbroj; exit 1 ako išta padne.
# CSP mora biti točno kao u public/_headers (i src/landing/landing.test.ts).
set -uo pipefail
ARG="${1:?host (npr. staging.logomedo.com) ili puni URL (http://localhost:8787)}"
case "$ARG" in http://*|https://*) BAZA="${ARG%/}" ;; *) BAZA="https://${ARG%/}" ;; esac
STAGING=0; [[ "$BAZA" == *"://staging."* ]] && STAGING=1
LOKALNO=0; [[ "$BAZA" == *"://localhost"* || "$BAZA" == *"://127.0.0.1"* ]] && LOKALNO=1
CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.logomedo.com; media-src 'self' https://cdn.logomedo.com; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"

RADNI="$(mktemp -d)"; trap 'rm -rf "$RADNI"' EXIT
OK=0; GRESKE=0
ok() { OK=$((OK + 1)); echo "OK      $*"; }
greska() { GRESKE=$((GRESKE + 1)); echo "GREŠKA  $*"; }
provjeri() { local opis="$1"; shift; if "$@"; then ok "$opis"; else greska "$opis"; fi; }

# GET → $RADNI/z (zaglavlja, CR uklonjen), $RADNI/t (tijelo); ispiše status.
dohvati() {
  curl -sS --max-time 20 -o "$RADNI/t" -D "$RADNI/z.raw" -w '%{http_code}' "$BAZA$1" 2>"$RADNI/e" || true
  tr -d '\r' <"$RADNI/z.raw" >"$RADNI/z" 2>/dev/null || : >"$RADNI/z"
}
zaglavlje() { grep -i "^$1:" "$RADNI/z" | sed 's/^[^:]*:[[:space:]]*//'; }  # sve vrijednosti, redak po redak
status() { curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$BAZA$1" 2>/dev/null || echo 000; }

echo "Landing provjera: $BAZA$([[ $STAGING == 1 ]] && echo ' (staging)')"

# sitemap.xml
s="$(dohvati /sitemap.xml)"
provjeri "/sitemap.xml 200 ($s)" test "$s" = 200
cp "$RADNI/t" "$RADNI/sitemap.xml"
provjeri "/sitemap.xml ispravan XML" xmllint --noout "$RADNI/sitemap.xml"
LOC=$(grep -o '<loc>[^<]*</loc>' "$RADNI/sitemap.xml" | sed 's#</*loc>##g')
n=$(printf '%s\n' "$LOC" | grep -c '^https://logomedo.com/' || true)
provjeri "/sitemap.xml ima 6 <loc> na https://logomedo.com ($n)" test "$n" = 6
PUTANJE=$(printf '%s\n' "$LOC" | sed 's#^https://logomedo.com##' | grep '^/' || true)

: >"$RADNI/linkovi"
for p in $PUTANJE; do
  s="$(dohvati "$p")"
  provjeri "$p 200 ($s)" test "$s" = 200
  c="$(zaglavlje content-security-policy)"
  provjeri "$p CSP točno kao u _headers (jedno zaglavlje)" test "$c" = "$CSP"
  provjeri "$p x-content-type-options nosniff" test "$(zaglavlje x-content-type-options)" = nosniff
  provjeri "$p referrer-policy strict-origin-when-cross-origin" test "$(zaglavlje referrer-policy)" = strict-origin-when-cross-origin
  provjeri "$p x-frame-options DENY" test "$(zaglavlje x-frame-options)" = DENY
  cc="$(zaglavlje cache-control | paste -sd '|' -)"
  provjeri "$p cache-control no-cache ($cc)" test "$cc" = no-cache
  xr="$(zaglavlje x-robots-tag | paste -sd '|' -)"
  if [[ $STAGING == 1 ]]; then provjeri "$p x-robots-tag noindex (staging)" test "$xr" = noindex
  elif [[ $LOKALNO == 0 ]]; then provjeri "$p bez x-robots-tag noindex (produkcija: '$xr')" test -z "$xr"; fi
  inline=$(grep -o '<script[^>]*>' "$RADNI/t" | grep -vc 'src=' || true)
  provjeri "$p bez inline <script> ($inline)" test "$inline" = 0
  provjeri "$p bez placeholdera „— S6]”" bash -c '! grep -q "— S6\]" "$1"' _ "$RADNI/t"
  provjeri "$p link rel=canonical https://logomedo.com$p" grep -q "<link rel=\"canonical\" href=\"https://logomedo.com$p\"" "$RADNI/t"
  # Interni linkovi: href="/…", src="/…" i svaki URL u srcset="/… 256w, /… 512w"
  { grep -oE '(href|src)="/[^/"][^"]*"|(href|src)="/"' "$RADNI/t" | sed -E 's/^(href|src)="//; s/"$//'
    grep -oE 'srcset="[^"]*"' "$RADNI/t" | sed -E 's/^srcset="//; s/"$//' | tr ',' '\n' | awk '{print $1}' | grep '^/' ; } >>"$RADNI/linkovi"
done

# Interni linkovi bez 404 (bez #sidra i ?upita, deduplicirano)
for l in $(sed -E 's/[#?].*$//' "$RADNI/linkovi" | grep . | sort -u); do
  s="$(status "$l")"
  provjeri "link $l ($s)" test "$s" != 404 -a "$s" -lt 500 -a "$s" != 000
done

# robots.txt
s="$(dohvati /robots.txt)"
provjeri "/robots.txt 200 ($s)" test "$s" = 200
for r in "Disallow: /admin" "Disallow: /api" "Disallow: /b" "Sitemap: https://logomedo.com/sitemap.xml"; do
  provjeri "/robots.txt ima '$r'" grep -qx "$r" <(tr -d '\r' <"$RADNI/t")
done

# Nepostojeća putanja → 404 (prerenderirana 404, noindex)
s="$(dohvati /ova-stranica-ne-postoji-xyz)"
provjeri "nepostojeća putanja 404 ($s)" test "$s" = 404
provjeri "404 ima meta robots noindex" grep -q '<meta name="robots" content="noindex">' "$RADNI/t"

# SSR (middleware) i dalje kao prije
s="$(dohvati /admin/login)"
provjeri "/admin/login 200 ($s)" test "$s" = 200
c="$(zaglavlje content-security-policy)"
provjeri "/admin/login CSP iz middlewarea sadrži nonce-" grep -q "nonce-" <<<"$c"
nds=$(grep -o 'default-src' <<<"$c" | wc -l | tr -d ' ')
provjeri "/admin/login CSP nije spojen s _headers (default-src ×$nds)" test "$nds" = 1
s="$(dohvati /admin)"
provjeri "/admin 302 ($s)" test "$s" = 302
provjeri "/admin preusmjerava na /admin/login" grep -q '/admin/login' <<<"$(zaglavlje location)"
s="$(dohvati /api/v1/ja)"
provjeri "/api/v1/ja 401 ($s)" test "$s" = 401

echo "Zbroj: $OK OK, $GRESKE GREŠKA"
[[ $GRESKE == 0 ]]
