#!/usr/bin/env bash
# Ilustracije landinga (docs/landing/sadrzaj.md odjeljak 4: V-1, V-8, V-9, V-25, V-26) s cdn.logomedo.com u public/landing/*.webp.
# Jednokratno, ručno: ./scripts/landing-ilustracije.sh <radni-dir> [ime ...]
# Bez imena obradi sve; s imenima samo njih (npr. riba-bojanka sunce-bojanka), pa postojeće datoteke ostaju netaknute.
# Original se preuzima u NOVI prazan <radni-dir>/izvor (nepouzdani podaci: samo se konvertiraju, ništa se ne pokreće).
# V-1 (riba, sunce, zhaba, lav): 512 i 256 px; V-8/V-9 bojanke (riba, sunce): 512 px; V-25 (sova): 512 px; V-26 (mish): 256 px. Treba magick (ImageMagick 7, s WebP).
set -euo pipefail
KORIJEN="$(cd "$(dirname "$0")/.." && pwd)"
RADNI="${1:?radni dir (npr. scratchpad)}"
shift
SAMO=" $* "
IZVOR="$RADNI/izvor"
IZLAZ="$KORIJEN/public/landing"
CDN="https://cdn.logomedo.com"
[[ -e "$IZVOR" ]] && { echo "$IZVOR već postoji; zadaj novi radni dir" >&2; exit 1; }
mkdir -p "$IZVOR" "$IZLAZ"

# ime | ključ na CDN-u | veličine
SLIKE=(
  "riba|ilustracija/riba/08b78c1b64f7ace1.png|512 256"
  "sunce|ilustracija/sunce/7b78ac6aeb220458.png|512 256"
  "zaba|ilustracija/zhaba/5bd3da7ad6c5afb4.png|512 256"
  "lav|ilustracija/lav/64116adb7fe6882d.png|512 256"
  "mis|ilustracija/mish/c033416244ccab9b.png|256"
  "sova|ilustracija/sova/25415d78d2f71e60.png|512"
  "riba-bojanka|bojanka/riba/92c77de0ca525f8a.png|512"
  "sunce-bojanka|bojanka/sunce/98eabebff5090197.png|512"
)

for red in "${SLIKE[@]}"; do
  IFS='|' read -r ime kljuc velicine <<<"$red"
  [[ "$SAMO" == "  " || "$SAMO" == *" $ime "* ]] || continue
  ulaz="$IZVOR/$ime.png"
  curl -fsS --max-time 60 --proto '=https' -o "$ulaz" "$CDN/$kljuc"
  # Mora biti PNG; sve ostalo se odbija prije konverzije.
  [[ "$(magick identify -format '%m' "$ulaz[0]")" == "PNG" ]] || { echo "$ime: nije PNG" >&2; exit 1; }
  for v in $velicine; do
    magick "$ulaz[0]" -strip -resize "${v}x${v}" -quality 82 -define webp:method=6 "$IZLAZ/$ime-$v.webp"
    echo "$IZLAZ/$ime-$v.webp $(magick identify -format '%wx%h' "$IZLAZ/$ime-$v.webp") $(wc -c <"$IZLAZ/$ime-$v.webp" | tr -d ' ') B"
  done
done
