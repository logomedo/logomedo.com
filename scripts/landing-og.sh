#!/usr/bin/env bash
# OG slika landinga (V-27, docs/landing/sadrzaj.md 2.5): public/landing/og.png, PNG 1200 × 630.
# Lijevo naslov kao h1 naslovne (Fraunces; odluka 806, bez kurziva), desno četiri ilustracije V-1.
# Ručno, nakon scripts/landing-ilustracije.sh: ./scripts/landing-og.sh [radni-dir]
# HTML se slaže u radni dir (zadano mktemp) i snima headless Chromeom; ništa ne ide na mrežu.
set -euo pipefail
KORIJEN="$(cd "$(dirname "$0")/.." && pwd)"
RADNI="${1:-$(mktemp -d)}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
IZLAZ="$KORIJEN/public/landing/og.png"
FONT="$KORIJEN/node_modules/@fontsource-variable/fraunces"
L="$KORIJEN/public/landing"
mkdir -p "$RADNI"
for s in rukavice sunce zirafa lav; do [[ -f "$L/$s-512.webp" ]] || { echo "nema $L/$s-512.webp (scripts/landing-ilustracije.sh)" >&2; exit 1; }; done

cat >"$RADNI/og.html" <<HTML
<!doctype html>
<html lang="hr"><head><meta charset="utf-8">
<link rel="stylesheet" href="file://$FONT/full.css">
<link rel="stylesheet" href="file://$FONT/full-italic.css">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { background: #f8f5ef; color: #1d1914; font-family: "Fraunces Variable", Georgia, serif; display: grid;
    grid-template-columns: 1fr 470px; align-items: center; gap: 40px; padding: 0 64px 0 80px; box-sizing: border-box; }
  .marka { display: flex; align-items: center; gap: 14px; font-size: 34px; font-weight: 500; font-variation-settings: "SOFT" 100, "opsz" 48; }
  .marka b { font-weight: 700; color: #9c6300; }
  h1 { margin: 34px 0 0; font-weight: 600; font-size: 70px; line-height: 1.05; letter-spacing: -.025em; font-variation-settings: "SOFT" 100, "opsz" 144; }
  h1 em { font-style: italic; font-weight: 500; color: #9c6300; }
  .slike { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .slike img { width: 100%; border-radius: 22px; border: 1px solid #e7e0d4; background: #fff;
    box-shadow: 0 2px 4px rgb(60 40 10 / .05), 0 8px 24px rgb(60 40 10 / .08); }
  .slike img:nth-child(2n) { transform: translateY(22px); }
  .slike { transform: translateY(-11px); }
</style></head>
<body>
  <div>
    <div class="marka">
      <svg width="46" height="46" viewBox="0 0 32 32"><path d="M16 1.8 28.3 8.9v14.2L16 30.2 3.7 23.1V8.9Z" fill="#d48a06"/>
        <path d="M12 9.5v12.5h8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>Logo<b>Medo</b></span>
    </div>
    <h1>Slike, listići<br>i igre za vježbu<br>s djecom</h1>
  </div>
  <div class="slike">
    <img src="file://$L/rukavice-512.webp"><img src="file://$L/sunce-512.webp"><img src="file://$L/zirafa-512.webp"><img src="file://$L/lav-512.webp">
  </div>
</body></html>
HTML

"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --allow-file-access-from-files \
  --user-data-dir="$RADNI/profil" --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=3000 \
  --screenshot="$RADNI/og-sirovo.png" "file://$RADNI/og.html" >/dev/null 2>&1
magick "$RADNI/og-sirovo.png" -strip -crop 1200x630+0+0 +repage -define png:compression-level=9 "$IZLAZ"
echo "$IZLAZ $(magick identify -format '%wx%h' "$IZLAZ") $(wc -c <"$IZLAZ" | tr -d ' ') B"
