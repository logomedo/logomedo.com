#!/usr/bin/env python3
"""Kvadratne varijante nekvadratnih slika u katalogu (katalog je 1:1; ručni upload zna biti 16:9).

    python3 scripts/kvadrat.py --prod --mjeri    # popuni slike.sirina/visina gdje fale (čita zaglavlja iz R2)
    python3 scripts/kvadrat.py --prod --suho     # samo napravi varijante i pregled.jpg, ništa ne šalje
    python3 scripts/kvadrat.py --prod            # pošalji varijante kao kandidate u /admin/pregled
    python3 scripts/kvadrat.py --prod --id 48    # samo te slike (može više puta)

Za svaku odobrenu nekvadratnu sliku bez varijante bira način:
  izrez   jednolika pozadina, a predmet stane u kvadrat: kvadrat oko predmeta
  dopuna  jednolika pozadina, predmet je širi od kvadrata, a nizak: cijela slika, gore i dolje pozadina
  model   scena do rubova (stol, stolnjak, nebo) ili predmet preširok i previsok: Vertex (gemini-nano-banana-2.1) ponovi sliku u 1:1
Varijanta ide na PUT /api/runner/varijanta/:id i čeka pregled; odobrena zamjenjuje original.
Okolina: LOGOMEDO_URL i RUNNER_TOKEN (--prod: .env.production, inače .dev.vars), VERTEX_ACCOUNT, VERTEX_PROJECT.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

KORIJEN = Path(__file__).resolve().parent.parent
RADNI = Path(os.environ.get("RADNI_DIR", Path.home() / "git/.agy-logomedo")) / "kvadrat"
PROMPT_MODEL = (
    "Recreate this exact illustration as a square 1:1 image. Keep the subject, its drawing, colors and style "
    "unchanged and show it whole, nothing cut off at the edges. Extend the existing background and surroundings "
    "naturally at the top and bottom to fill the square. Do not add new objects or text."
)


def okolina(prod: bool) -> dict:
    v = {}
    for f in ([KORIJEN / ".env.production"] if prod else []) + [KORIJEN / ".dev.vars"]:
        if f.exists():
            for red in f.read_text().splitlines():
                if "=" in red and not red.startswith("#"):
                    k, _, x = red.partition("=")
                    v.setdefault(k.strip(), x.strip())
    v.update({k: os.environ[k] for k in ("LOGOMEDO_URL", "RUNNER_TOKEN", "VERTEX_ACCOUNT", "VERTEX_PROJECT") if k in os.environ})
    v.setdefault("LOGOMEDO_URL", "http://localhost:4321")
    return v


def d1(sql: str, prod: bool) -> list[dict]:
    r = subprocess.run(["npx", "wrangler", "d1", "execute", "logomedo", "--remote" if prod else "--local", "--json", "--command", sql],
                       cwd=KORIJEN, capture_output=True, text=True, env={**os.environ, "CI": "1"}, stdin=subprocess.DEVNULL)
    if r.returncode:
        sys.exit(f"d1: {r.stderr.strip()[-500:]}")
    return json.loads(r.stdout)[0]["results"]


def d1_datoteka(sql: str, prod: bool):
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        f.write(sql)
    r = subprocess.run(["npx", "wrangler", "d1", "execute", "logomedo", "--remote" if prod else "--local", "--file", f.name],
                       cwd=KORIJEN, capture_output=True, text=True, env={**os.environ, "CI": "1"}, stdin=subprocess.DEVNULL)
    os.unlink(f.name)
    if r.returncode:
        sys.exit(f"d1: {r.stderr.strip()[-500:]}")


def r2(kljuc: str, put: Path, prod: bool) -> Path:
    r = subprocess.run(["npx", "wrangler", "r2", "object", "get", f"logomedo-slike/{kljuc}", "--remote" if prod else "--local", "--file", str(put)],
                       cwd=KORIJEN, capture_output=True, text=True, env={**os.environ, "CI": "1"}, stdin=subprocess.DEVNULL)
    if r.returncode or not put.exists():
        raise RuntimeError(f"r2 {kljuc}: {r.stderr.strip()[-300:]}")
    return put


def mjeri(prod: bool):
    """Dimenzije za retke koji ih nemaju (slike prije migracije 0023)."""
    from concurrent.futures import ThreadPoolExecutor
    redovi = d1("SELECT id, r2_kljuc FROM slike WHERE sirina IS NULL ORDER BY id", prod)
    print(f"{len(redovi)} slika bez dimenzija", file=sys.stderr)
    tmp = Path(tempfile.mkdtemp())

    def jedna(x):
        try:
            p = r2(x["r2_kljuc"], tmp / str(x["id"]), prod)
            with Image.open(p) as im:
                w, h = im.size
            p.unlink()
            return x["id"], w, h
        except Exception as e:  # noqa: BLE001
            print(f"#{x['id']}: {e}", file=sys.stderr)
            return None

    rez = [r for r in ThreadPoolExecutor(6).map(jedna, redovi) if r]
    for i in range(0, len(rez), 200):
        d1_datoteka("\n".join(f"UPDATE slike SET sirina = {w}, visina = {h} WHERE id = {i_};" for i_, w, h in rez[i:i + 200]), prod)
    print(f"upisano {len(rez)}", file=sys.stderr)


def pozadina(im: Image.Image):
    """Boja ruba i je li rub jednolik (papir, a ne stol ili scena do rubova)."""
    m = im.convert("RGB").resize((200, max(1, round(200 * im.height / im.width))))
    w, h = m.size
    px = m.load()
    rub = [px[x, y] for x in range(w) for y in (0, 1, h - 2, h - 1)] + [px[x, y] for y in range(h) for x in (0, 1, w - 2, w - 1)]
    boja = tuple(sorted(c[i] for c in rub)[len(rub) // 2] for i in range(3))
    blizu = sum(1 for c in rub if max(abs(c[i] - boja[i]) for i in range(3)) < 28) / len(rub)
    return boja, blizu > 0.9


def okvir_predmeta(im: Image.Image, boja) -> tuple[int, int, int, int]:
    """Okvir svega što se razlikuje od pozadine (na smanjenoj slici, preračunato natrag)."""
    k = 4
    m = im.convert("RGB").resize((im.width // k, im.height // k)).filter(ImageFilter.MedianFilter(3))
    px = m.load()
    xs, ys = [], []
    for y in range(m.height):
        for x in range(m.width):
            c = px[x, y]
            if max(abs(c[i] - boja[i]) for i in range(3)) > 40:
                xs.append(x); ys.append(y)
    if not xs:
        return 0, 0, im.width, im.height
    return min(xs) * k, min(ys) * k, (max(xs) + 1) * k, (max(ys) + 1) * k


def kvadrat(im: Image.Image) -> tuple[str, Image.Image | None]:
    im = im.convert("RGB")
    w, h = im.size
    boja, jednolika = pozadina(im)
    if not jednolika:
        return "model", None
    s, siroka = min(w, h), w > h
    x0, y0, x1, y1 = okvir_predmeta(im, boja)
    duljina = (x1 - x0) if siroka else (y1 - y0)
    if duljina <= s * 0.92:
        sred = ((x0 + x1) // 2) if siroka else ((y0 + y1) // 2)
        poc = max(0, min(sred - s // 2, (w if siroka else h) - s))
        return "izrez", im.crop((poc, 0, poc + s, s) if siroka else (0, poc, s, poc + s))
    # Predmet je i širok i visok (vrtuljak, pregača): dopuna bi ga smanjila na pola, pa ga crta model.
    if ((y1 - y0) if siroka else (x1 - x0)) > s * 0.85:
        return "model", None
    # Dopuna: rub originala se postupno stapa s bojom pozadine, da se ne vidi šav.
    d = max(w, h)
    platno = Image.new("RGB", (d, d), boja)
    maska = Image.new("L", (w, h), 255)
    md = ImageDraw.Draw(maska)
    for i in range(48):
        a = round(255 * i / 48)
        if siroka:
            md.line([(0, i), (w, i)], fill=a); md.line([(0, h - 1 - i), (w, h - 1 - i)], fill=a)
        else:
            md.line([(i, 0), (i, h)], fill=a); md.line([(w - 1 - i, 0), (w - 1 - i, h)], fill=a)
    platno.paste(im, ((d - w) // 2, (d - h) // 2), maska)
    if d > 2048:
        platno = platno.resize((2048, 2048), Image.LANCZOS)
    return "dopuna", platno


def vertex(original: Path, izlaz: Path, env: dict) -> Path:
    racun = env.get("VERTEX_ACCOUNT") or sys.exit("Nema VERTEX_ACCOUNT")
    gcloud = os.environ.get("GCLOUD") or shutil.which("gcloud") or str(Path.home() / "google-cloud-sdk/bin/gcloud")
    token = subprocess.run([gcloud, "auth", "print-access-token", f"--account={racun}"], capture_output=True, text=True, check=True).stdout.strip()
    for pokusaj in range(4):  # 429 je minutna kvota: čekaj i ponovi
        r = subprocess.run([sys.executable, str(KORIJEN / "scripts/vertex-slika.py"), str(izlaz), PROMPT_MODEL, str(original)],
                           capture_output=True, text=True,
                           env={**os.environ, "VERTEX_TOKEN": token, "VERTEX_ASPECT": "1:1", "VERTEX_PREDLOZAK": "1",
                                "VERTEX_PROJECT": env.get("VERTEX_PROJECT", "project-80b5a036-aed8-4b40-bd2")})
        if "HTTP 429" not in r.stderr:
            break
        time.sleep(60 * (pokusaj + 1))
    if r.returncode:
        raise RuntimeError(f"vertex: {r.stderr.strip()[-300:]}")
    return Path(r.stdout.strip().splitlines()[-1])


def posalji(original_id: int, put: Path, nacin: str, env: dict):
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}[put.suffix[1:].lower()]
    zahtjev = urllib.request.Request(f"{env['LOGOMEDO_URL']}/api/runner/varijanta/{original_id}", data=put.read_bytes(), method="PUT",
                                     headers={"Authorization": f"Bearer {env['RUNNER_TOKEN']}", "Content-Type": mime, "X-Nacin": nacin,
                                              "User-Agent": "logomedo-kvadrat"})
    try:
        with urllib.request.urlopen(zahtjev) as o:
            return json.load(o)
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code} {e.read().decode()[:200]}"}


def pregled(stavke: list[tuple[int, str, Path, Path]], put: Path):
    """Original lijevo, varijanta desno, po red za svaku sliku."""
    vis, red = 240, []
    for i, nacin, orig, var in stavke:
        a = Image.open(orig).convert("RGB"); a = a.resize((round(a.width * vis / a.height), vis))
        b = Image.open(var).convert("RGB").resize((vis, vis))
        r = Image.new("RGB", (a.width + vis + 30, vis + 22), "white")
        r.paste(a, (0, 22)); r.paste(b, (a.width + 30, 22))
        ImageDraw.Draw(r).text((4, 4), f"#{i} {nacin}", fill="black")
        red.append(r)
    if not red:
        return
    list_ = Image.new("RGB", (max(r.width for r in red), sum(r.height for r in red)), "white")
    y = 0
    for r in red:
        list_.paste(r, (0, y)); y += r.height
    list_.save(put, quality=82)


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("--prod", action="store_true", help="produkcijska baza, R2 i URL")
    a.add_argument("--mjeri", action="store_true", help="samo popuni dimenzije")
    a.add_argument("--suho", action="store_true", help="ne šalji ništa, samo napravi varijante i pregled.jpg")
    a.add_argument("--bez-modela", action="store_true", help="preskoči slike kojima treba Vertex")
    a.add_argument("--id", type=int, action="append", help="samo ta slika (originala)")
    o = a.parse_args()
    env = okolina(o.prod)
    if o.mjeri:
        return mjeri(o.prod)
    if not o.suho and not env.get("RUNNER_TOKEN"):
        sys.exit("Nema RUNNER_TOKEN")

    redovi = d1("""SELECT s.id, s.r2_kljuc, r.rijec FROM slike s JOIN rijeci r ON r.id = s.rijec_id
                   WHERE s.status = 'odobrena' AND s.sirina IS NOT NULL AND s.sirina != s.visina
                     AND NOT EXISTS (SELECT 1 FROM slike v WHERE v.zamjenjuje = s.id AND v.status IN ('kandidat', 'odobrena'))
                   ORDER BY s.id""", o.prod)
    if o.id:
        redovi = [x for x in redovi if x["id"] in o.id]
    nemjerene = d1("SELECT COUNT(*) AS n FROM slike WHERE sirina IS NULL", o.prod)[0]["n"]
    if nemjerene:
        print(f"⚠️  {nemjerene} slika nema dimenzije; prvo --mjeri", file=sys.stderr)
    print(f"{len(redovi)} nekvadratnih odobrenih bez varijante", file=sys.stderr)

    RADNI.mkdir(parents=True, exist_ok=True)
    stavke = []
    for x in redovi:
        i = x["id"]
        orig = r2(x["r2_kljuc"], RADNI / f"{i}-original{Path(x['r2_kljuc']).suffix}", o.prod)
        nacin, slika = kvadrat(Image.open(orig))
        if nacin == "model":
            if o.bez_modela:
                print(f"#{i} {x['rijec']}: treba model, preskačem", file=sys.stderr)
                continue
            try:
                var = vertex(orig, RADNI / f"{i}-kvadrat", env)
            except Exception as e:  # noqa: BLE001
                print(f"#{i} {x['rijec']}: {e}", file=sys.stderr)
                continue
            nacin = os.environ.get("VERTEX_MODEL", "gemini-nano-banana-2.1")
        else:
            var = RADNI / f"{i}-kvadrat.jpg"
            slika.save(var, quality=92)
        stavke.append((i, nacin, orig, var))
        ishod = "suho" if o.suho else posalji(i, var, nacin, env)
        print(f"#{i} {x['rijec']}: {nacin} → {ishod}", file=sys.stderr)
    pregled(stavke, RADNI / "pregled.jpg")
    print(RADNI / "pregled.jpg")


if __name__ == "__main__":
    main()
