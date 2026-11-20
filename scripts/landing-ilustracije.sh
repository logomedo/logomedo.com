#!/usr/bin/env bash
# Ilustracije landinga (docs/landing/sadrzaj.md odjeljak 4: V-1, V-8, V-9, V-25, V-26) s cdn.logomedo.com u public/landing/*.webp.
# Jednokratno, ručno: ./scripts/landing-ilustracije.sh <radni-dir> [ime ...]
# Bez imena obradi sve; s imenima samo njih (npr. rukavice-bojanka sunce-bojanka), pa postojeće datoteke ostaju netaknute.
# Original se preuzima u NOVI prazan <radni-dir>/izvor (nepouzdani podaci: samo se konvertiraju, ništa se ne pokreće).
# V-1 (rukavice, sunce, zhirafa, lav; odluka 800): 512 i 256 px; V-8/V-9 bojanke (rukavice, sunce): 512 px; V-25 (sova): 512 px; V-26 (mish): 256 px. Treba magick (ImageMagick 7, s WebP).
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
  "rukavice|ilustracija/rukavice/e672bb66109e13c6.png|512 256"
  "sunce|ilustracija/sunce/7b78ac6aeb220458.png|512 256"
  "zirafa|ilustracija/zhirafa/a8f5bfc0c09f4158.png|512 256"
  "lav|ilustracija/lav/64116adb7fe6882d.png|512 256"
  "mis|ilustracija/mish/c033416244ccab9b.png|256"
  "sova|ilustracija/sova/25415d78d2f71e60.png|512 256"
  "rukavice-bojanka|bojanka/rukavice/f314aad932d163cb.png|512"
  "sunce-bojanka|bojanka/sunce/98eabebff5090197.png|512"
  # Hero izmjenjuje slike istog slova (odluka 802): R, S, L po tri dodatne, Ž dvije (bez žabe, odluka 803).
  "riba|ilustracija/riba/f87b53e68b725444.png|512 256"
  "raketa|ilustracija/raketa/5095a37112d55eb8.png|512 256"
  "robot|ilustracija/robot/604cf51177d86b58.png|512 256"
  "sladoled|ilustracija/sladoled/79a12f5d9061a6a8.png|512 256"
  "snjegovic|ilustracija/snjegovicj/6c00fecfd7e3211b.png|512 256"
  "zarulja|ilustracija/zharulja/44b14db46f91aef8.png|512 256"
  "zir|ilustracija/zhir/07f3e5b75ab53795.png|512 256"
  "lisica|ilustracija/lissica/b584fae3d9e145b5.png|512 256"
  "leptir|ilustracija/leptir/c634786655d4a0e9.png|512 256"
  "lubenica|ilustracija/lubenica/17e669b6f46e5cd9.png|512 256"
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
