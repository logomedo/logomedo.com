# Demo videi (HyperFrames)

Kratki videi koji objašnjavaju LogoMedo: za WhatsApp poruku uz odobren pristup, kasnije možda za landing.
Svaki video je zaseban [HyperFrames](https://hyperframes.heygen.com) projekt (HTML + GSAP → MP4).

| Projekt | Što | Trajanje |
|---|---|---|
| `01-uvod/` | Općeniti uvod: katalog → glas R → predložak → PDF → vrste zadataka → bilježnica i igra → prijava | 77 s, 1920×1080 |

## Kako nastaje

```
narration.json ──tts-elevenlabs.mjs──► assets/voice/<scena>.mp3 + timing.json (vrijeme svake riječi)
scenes.json + timing.json + styles.css ──build-root.mjs──► index.html (scene jedna za drugom)
compositions/<scena>.html  (izgled i animacija scene; tekst se pojavljuje na riječ iz timing.json)
```

1. **Naracija** (`01-uvod/narration.json`): ElevenLabs, ključ iz `.dev.vars`, `eleven_v4`. Od v2 (24. 11. 2026.)
   čita Matijin Instant klon „stepanic-matija-naracija” `4TP4cWjWRL4EJlaqxMyv` (`../docs/klon-glasa.md`);
   v1 je čitala Elena `iahPPG34ls0Mm3W0DBhh` kao izgovor u appu (snimke u commitu `ca9b61f`). Nakon
   promjene glasa `--force all`, provjera Scribeom, pa usporedi vremena riječi i pomakni cue-ove u scenama. Brojke i kratice pisati
   kako se izgovaraju („šesto pedeset”, „pe-de-ef”, „logomedo točka com”). Promijenjen redak se sam
   ponovno generira: `node video/scripts/tts-elevenlabs.mjs video/01-uvod`. Provjera izgovora: Scribe.
2. **Vremena**: `node video/scripts/build-root.mjs video/01-uvod` složi `index.html`. Scena traje
   `lead + naracija + tail` (`scenes.json`). `index.html` se ne uređuje ručno.
3. **Scene**: `compositions/sN-*.html`. Unutar scene `VO` je trenutak kad kreće glas; animacije su
   `VO + vrijeme riječi` iz `assets/voice/timing.json`.
4. **Glazba** (nije u gitu): HeyGen katalog, pjesma `6453a0aba8804c9993de56e51f8e6c90`
   („gentle playful acoustic, soft glockenspiel, preschool educational”, 101 s). Skidanje:
   `heygen audio sounds list --type music --query "soft happy piano glockenspiel kids"` → `audio_url`
   → `01-uvod/assets/bgm/6453a0ab.mp3`. Treba `heygen auth login --oauth`.
5. **Provjera i render** (iz `01-uvod/`):
   ```bash
   S=$TMPDIR/hf; mkdir -p $S/xdg $S/cache; export XDG_RUNTIME_DIR=$S/xdg HYPERFRAMES_CACHE_DIR=$S/cache
   npx --yes hyperframes@0.9.91 check
   npx --yes hyperframes@0.9.91 snapshot --at 5,20,40,70
   npx --yes hyperframes@0.9.91 render -o renders/logomedo-uvod-v2.mp4
   # za WhatsApp: −15 LUFS i manja datoteka
   ffmpeg -i renders/logomedo-uvod-v2.mp4 -c:v libx264 -crf 22 -preset slow -pix_fmt yuv420p -movflags +faststart \
     -af "loudnorm=I=-15:TP=-1.5:LRA=11" -c:a aac -b:a 160k renders/logomedo-uvod-v2-wa.mp4
   ```
   `HYPERFRAMES_CACHE_DIR` mora biti privatan: `~/.cache` vodi na `DOMOVINA2TB`, koji HyperFrames odbija.

Snimke ekrana su iste kao na landingu (`public/landing/v*-desktop.webp`, bez e-mailova i imena).
Tekst ne kaže „za logopede” (vidi `docs/landing/decisions.md` 810–812).
