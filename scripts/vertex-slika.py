#!/usr/bin/env python3
"""Jedna slika iz Vertex AI (Gemini image) za runner.

    VERTEX_TOKEN=… vertex-slika.py <izlaz-bez-ekstenzije> <prompt> [ref.jpg ...]

Na stdout ispiše putanju spremljene slike (ekstenzija prema MIME-u).
Izlazni kodovi: 0 slika, 2 kvota/rate limit (429, posao natrag u red),
3 privremena greška (5xx, mreža), 4 istekao/neispravan token (401, posao natrag u red),
1 sve ostalo (blokada, nema slike, 4xx). IMAGE_RECITATION se prvo ponovi
s drugim seedom (do 2 puta) prije nego postane 1.
Poruka greške ide na stderr, jedan red.

Okolina: VERTEX_PROJECT, VERTEX_LOCATION (global), VERTEX_MODEL
(gemini-nano-banana-2.1), VERTEX_THINKING (LOW), VERTEX_ASPECT (1:1),
VERTEX_PREDLOZAK=1: referenca je slika koju treba ponoviti (situacija u drugom omjeru), ne uzor stila.
"""
import base64, json, mimetypes, os, random, sys, urllib.error, urllib.request

EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}


def main() -> int:
    if len(sys.argv) < 3:
        print("upotreba: vertex-slika.py <izlaz> <prompt> [ref ...]", file=sys.stderr)
        return 1
    izlaz, prompt, refs = sys.argv[1], sys.argv[2], sys.argv[3:]
    token = os.environ["VERTEX_TOKEN"]
    projekt = os.environ["VERTEX_PROJECT"]
    lok = os.environ.get("VERTEX_LOCATION", "global")
    model = os.environ.get("VERTEX_MODEL", "gemini-nano-banana-2.1")
    host = "aiplatform.googleapis.com" if lok == "global" else f"{lok}-aiplatform.googleapis.com"
    url = f"https://{host}/v1/projects/{projekt}/locations/{lok}/publishers/google/models/{model}:generateContent"

    dijelovi = []
    for r in refs:
        mime = mimetypes.guess_type(r)[0] or "image/jpeg"
        with open(r, "rb") as f:
            dijelovi.append({"inlineData": {"mimeType": mime, "data": base64.b64encode(f.read()).decode()}})
    if refs and os.environ.get("VERTEX_PREDLOZAK") == "1":
        dijelovi.append({"text": "The image above is the original illustration. Recreate exactly this picture."})
    elif refs:
        dijelovi.append({"text": "The images above are style references only. Copy their art style "
                         "(line work, colored pencil and watercolor texture, warm palette, light cream background), "
                         "never their subjects, objects or composition."})
    dijelovi.append({"text": prompt})

    # IMAGE_RECITATION: slika bi bila preblizu nekoj postojećoj (običan trokut, krug…). Isti prompt
    # pada svaki put (TROKUT 4. 11.: 6/6), pa se odmah ponavlja s drugim seedom i uputom za originalnost.
    for pokusaj in range(1 + RECITACIJA_PONOVI):
        dio = dijelovi if not pokusaj else dijelovi + [{"text": ORIGINALNO}]
        rc, razlog = jedan(url, token, dio, izlaz, seed=random.randrange(1, 2**31) if pokusaj else None)
        if rc != RECITACIJA:
            return rc
        print(f"vertex: {razlog}, ponavljam s drugim seedom ({pokusaj + 1}/{RECITACIJA_PONOVI})", file=sys.stderr)
    print(f"vertex: nema slike u odgovoru ({razlog}; preblizu postojećoj slici, učitaj ručno)", file=sys.stderr)
    return 1


RECITACIJA = -1
RECITACIJA_PONOVI = 2
ORIGINALNO = ("Make this an original drawing, not a copy of a common stock or clip-art image: "
              "a hand-drawn feel, slightly uneven lines and your own proportions, while keeping every rule above.")


def jedan(url: str, token: str, dijelovi: list, izlaz: str, seed: int | None) -> tuple[int, str]:
    """Jedan poziv. Vraća (izlazni kod, razlog); RECITACIJA kad treba ponoviti s drugim seedom."""
    config = {
        "responseModalities": ["IMAGE"],
        "imageConfig": {"aspectRatio": os.environ.get("VERTEX_ASPECT", "1:1")},
        "thinkingConfig": {"thinkingLevel": os.environ.get("VERTEX_THINKING", "LOW")},
    }
    if seed is not None:
        config["seed"] = seed
    tijelo = {"contents": [{"role": "user", "parts": dijelovi}], "generationConfig": config}
    zahtjev = urllib.request.Request(url, json.dumps(tijelo).encode(), method="POST", headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(zahtjev, timeout=int(os.environ.get("VERTEX_TIMEOUT", "180"))) as o:
            r = json.load(o)
    except urllib.error.HTTPError as e:
        poruka = e.read().decode(errors="replace")
        try:
            poruka = json.loads(poruka)["error"]["message"]
        except Exception:
            pass
        print(f"vertex HTTP {e.code}: {poruka[:300]}", file=sys.stderr)
        return (2 if e.code == 429 else 4 if e.code == 401 else 3 if e.code >= 500 else 1), ""
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"vertex mreža: {e}", file=sys.stderr)
        return 3, ""

    kandidati = r.get("candidates") or []
    for p in (kandidati[0].get("content", {}).get("parts", []) if kandidati else []):
        d = p.get("inlineData")
        if d and d.get("mimeType", "").startswith("image/"):
            put = f"{izlaz}.{EXT.get(d['mimeType'], 'png')}"
            with open(put, "wb") as f:
                f.write(base64.b64decode(d["data"]))
            u = r.get("usageMetadata", {})
            print(f"tokeni ulaz={u.get('promptTokenCount', 0)} slika={u.get('candidatesTokenCount', 0)} "
                  f"razmisljanje={u.get('thoughtsTokenCount', 0)}", file=sys.stderr)
            print(put)
            return 0, ""
    razlog = (kandidati[0].get("finishReason") if kandidati else None) or r.get("promptFeedback", {}).get("blockReason") or "nepoznato"
    if "RECITATION" in razlog:
        return RECITACIJA, razlog
    print(f"vertex: nema slike u odgovoru ({razlog})", file=sys.stderr)
    return 1, razlog


if __name__ == "__main__":
    sys.exit(main())
