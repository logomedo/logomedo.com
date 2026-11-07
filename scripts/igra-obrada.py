#!/usr/bin/env python3
"""Sirove slike iz igra-slike.sh → public/igra/*.webp + src/lib/igra-stabla.ts (obris krošnje).

    python3 scripts/igra-obrada.py <dir-sa-sirovim-slikama>

Stabla (bor, jabuka) dobiju prozirnu pozadinu: poplava od ruba slike kroz piksele blizu boje
kutova (bijela ili krem), pa mekani rub. Obris krošnje je po redovima lijevi i desni rub
neprozirnog dijela, u koordinatama viewBoxa širine 400; iz njega bor.ts/jabuka.ts slažu lampice.
"""
import json, sys
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter

KORIJEN = Path(__file__).resolve().parent.parent
JAVNO = KORIJEN / "public/igra"
SIRINA = 400  # viewBox stabla


def izrezi(src: Path) -> Image.Image:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    px = im.load()
    kutovi = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    poz = tuple(sum(c[i] for c in kutovi) // 4 for i in range(3))
    blizu = lambda c: sum((c[i] - poz[i]) ** 2 for i in range(3)) < 26 ** 2
    maska = Image.new("L", (w, h), 255)
    m = maska.load()
    red = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
    while red:
        x, y = red.popleft()
        if m[x, y] == 0 or not blizu(px[x, y]):
            continue
        m[x, y] = 0
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and m[nx, ny]:
                red.append((nx, ny))
    maska = maska.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    out = im.convert("RGBA")
    out.putalpha(maska)
    return out.crop(maska.point(lambda v: 255 if v > 40 else 0).getbbox())


def obris(im: Image.Image, korak: int = 5) -> list[list[float]]:
    """[y, lijevo, desno] svakih `korak` jedinica viewBoxa (alfa > 128)."""
    k = SIRINA / im.width
    a = im.getchannel("A").load()
    redovi = []
    for yv in range(0, int(im.height * k), korak):
        y = min(im.height - 1, int(yv / k))
        xs = [x for x in range(0, im.width, 2) if a[x, y] > 128]
        if xs:
            redovi.append([yv, round(xs[0] * k, 1), round(xs[-1] * k, 1)])
    return redovi


def main() -> None:
    src = Path(sys.argv[1])
    JAVNO.mkdir(parents=True, exist_ok=True)
    stabla = {}
    for ime in ("bor", "jabuka"):
        im = izrezi(src / f"{ime}.png")
        im = im.resize((600, round(im.height * 600 / im.width)), Image.LANCZOS)
        im.save(JAVNO / f"{ime}.webp", "WEBP", quality=82, method=6)
        stabla[ime] = {"visina": round(im.height * SIRINA / im.width, 1), "obris": obris(im)}
    for ime in ("bozic-vodoravno", "bozic-uspravno", "proljece-vodoravno", "proljece-uspravno"):
        Image.open(src / f"{ime}.png").convert("RGB").save(JAVNO / f"{ime}.webp", "WEBP", quality=80, method=6)
    ts = ("// Generira scripts/igra-obrada.py iz slika u public/igra/; ne uređivati ručno.\n"
          "// Obris stabla: [y, lijevo, desno] u viewBoxu širine 400.\n"
          f"export const STABLA = {json.dumps(stabla, separators=(',', ':'))} as const;\n")
    (KORIJEN / "src/lib/igra-stabla.ts").write_text(ts)
    for f in sorted(JAVNO.iterdir()):
        print(f.name, f.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
