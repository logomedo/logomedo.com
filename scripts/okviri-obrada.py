#!/usr/bin/env python3
"""Sirove slike iz okviri-slike.sh → public/okviri/*.png (prozirna pozadina, kvadrat 480 px).

    python3 scripts/okviri-obrada.py <dir-sa-sirovim-slikama> [ime ...]

Pozadina se miče poplavom od ruba kroz piksele blizu boje kutova (isto kao igra-obrada.py),
ukras se izreže i centrira u kvadrat, pa PDF i HTML ispis ukras u kutu crtaju jednake veličine.
PNG jer PDF (pdf-lib) ne zna WebP, a ukras leži na uzorku ruba pa treba prozirnost.
"""
import importlib.util
import sys
from pathlib import Path
from PIL import Image

# izrezi() iz igra-obrada.py (ime s crticom se ne može uvesti običnim importom).
_spec = importlib.util.spec_from_file_location("igra_obrada", Path(__file__).resolve().parent / "igra-obrada.py")
_igra = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_igra)
izrezi = _igra.izrezi

KORIJEN = Path(__file__).resolve().parent.parent
JAVNO = KORIJEN / "public/okviri"
STRANICA = 480


def main() -> None:
    src = Path(sys.argv[1])
    imena = sys.argv[2:] or sorted(p.stem for p in src.glob("*.png"))
    JAVNO.mkdir(parents=True, exist_ok=True)
    for ime in imena:
        im = izrezi(src / f"{ime}.png")
        k = (STRANICA - 16) / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        kv = Image.new("RGBA", (STRANICA, STRANICA), (0, 0, 0, 0))
        kv.paste(im, ((STRANICA - im.width) // 2, (STRANICA - im.height) // 2), im)
        kv.save(JAVNO / f"{ime}.png", "PNG", optimize=True)
        print(ime, (JAVNO / f"{ime}.png").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
