#!/usr/bin/env python3
"""Odabrane sirove slike iz spremnici-slike.sh → public/spremnici/<tema>.png + položaj bijelog kruga za oznaku.

    python3 scripts/spremnici-obrada.py vrece=<put.png> kosare=<put.png> kutije=<put.png>

Pozadina se miče kao u okviri-obrada.py (izrezi() iz igra-obrada.py), spremnik se centrira u kvadrat 480 px
(PNG jer PDF, pdf-lib, ne zna WebP). Bijeli krug za slovo nađe se kao najveća bijela mrlja unutar spremnika;
ispis je `OZNAKE` za src/lib/spremnici.ts (središte i polumjer u postocima stranice kvadrata).
"""
import importlib.util
import json
import sys
from collections import deque
from pathlib import Path
from PIL import Image

_spec = importlib.util.spec_from_file_location("igra_obrada", Path(__file__).resolve().parent / "igra-obrada.py")
_igra = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_igra)

KORIJEN = Path(__file__).resolve().parent.parent
JAVNO = KORIJEN / "public/spremnici"
STRANICA = 480


def krug(im: Image.Image) -> dict:
    """Najveća povezana bijela (neprozirna) mrlja: središte i polumjer iz površine, u % stranice."""
    w, h = im.size
    px = im.load()
    bijelo = lambda x, y: px[x, y][3] > 200 and min(px[x, y][:3]) > 228
    vidjeno = bytearray(w * h)
    naj = (0, 0.0, 0.0)
    for y0 in range(h):
        for x0 in range(w):
            if vidjeno[y0 * w + x0] or not bijelo(x0, y0):
                continue
            red, n, sx, sy = deque([(x0, y0)]), 0, 0, 0
            vidjeno[y0 * w + x0] = 1
            while red:
                x, y = red.popleft()
                n += 1; sx += x; sy += y
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not vidjeno[ny * w + nx] and bijelo(nx, ny):
                        vidjeno[ny * w + nx] = 1
                        red.append((nx, ny))
            if n > naj[0]:
                naj = (n, sx / n, sy / n)
    n, cx, cy = naj
    r = (n / 3.14159) ** 0.5
    return {"cx": round(cx / w * 100, 1), "cy": round(cy / h * 100, 1), "r": round(r / w * 100, 1)}


def rupe(kv: Image.Image, poz: tuple) -> None:
    """Zatvorene rupe boje pozadine (unutar ručke košare) postanu prozirne. Bijelo (krug za oznaku) ostaje."""
    w, h = kv.size
    px = kv.load()
    blizu = lambda c: c[3] > 0 and sum((c[i] - poz[i]) ** 2 for i in range(3)) < 26 ** 2 and min(c[:3]) <= 238
    vidjeno = bytearray(w * h)
    for y0 in range(h):
        for x0 in range(w):
            if vidjeno[y0 * w + x0] or not blizu(px[x0, y0]):
                continue
            red, mrlja = deque([(x0, y0)]), []
            vidjeno[y0 * w + x0] = 1
            while red:
                x, y = red.popleft()
                mrlja.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not vidjeno[ny * w + nx] and blizu(px[nx, ny]):
                        vidjeno[ny * w + nx] = 1
                        red.append((nx, ny))
            if len(mrlja) > w * h * 0.004:
                for x, y in mrlja:
                    px[x, y] = (*px[x, y][:3], 0)


def main() -> None:
    JAVNO.mkdir(parents=True, exist_ok=True)
    oznake = {}
    for arg in sys.argv[1:]:
        tema, put = arg.split("=", 1)
        izvor = Image.open(put).convert("RGB")
        kutovi = [izvor.getpixel(xy) for xy in ((2, 2), (izvor.width - 3, 2), (2, izvor.height - 3), (izvor.width - 3, izvor.height - 3))]
        poz = tuple(sum(c[i] for c in kutovi) // 4 for i in range(3))
        im = _igra.izrezi(Path(put))
        k = (STRANICA - 16) / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        kv = Image.new("RGBA", (STRANICA, STRANICA), (0, 0, 0, 0))
        kv.paste(im, ((STRANICA - im.width) // 2, (STRANICA - im.height) // 2), im)
        rupe(kv, poz)
        kv.save(JAVNO / f"{tema}.png", "PNG", optimize=True)
        oznake[tema] = krug(kv)
        print(tema, (JAVNO / f"{tema}.png").stat().st_size // 1024, "KB", oznake[tema], file=sys.stderr)
    print(json.dumps(oznake))


if __name__ == "__main__":
    main()
