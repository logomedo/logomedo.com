# Katalog slika po glasovima

## Model

```mermaid
erDiagram
  glasovi ||--o{ rijec_glas : ""
  rijeci ||--o{ rijec_glas : "glas × pozicija"
  rijeci ||--o{ slike : ""
  stilovi ||--o{ slike : ""
  rijeci ||--o{ generiranja : ""
  generiranja |o--o| slike : "rezultat"
```

- **`rijec_glas`**: riječ može biti pod više glasova i pozicija. KRASTAVAC je R skupina,
  S medijalna i C finalna. Stari app je imao jednu putanju po slici.
- **`potvrdeno`**: 1 = iz starog kataloga ili ga je potvrdio admin; 0 = izvedeno iz pravopisa
  (`src/lib/fonemi.ts`). Admin ih potvrđuje ili miče na stranici riječi.
- **`stilovi`**: zasad samo `bojanka`. Prompt je predložak s `{rijec}`, `{opis}` i `{napomena}`.
  Novi stil (npr. u boji) je novi redak, a slike se drže po riječi i stilu.
- **`slike.status`**: `kandidat` → `odobrena` | `odbijena`. Po riječi i stilu najviše je jedna
  odobrena (djelomični unique indeks). Razlog odbijanja ulazi u prompt sljedećeg generiranja
  („Avoid: …”).
- **`rijeci.opis_za_sliku`**: rješava homonime (luk, kosa, pas) i ide u prompt.

## Pozicije

Hrvatski pravopis je fonemski, pa `fonemi.ts` iz riječi izvodi glasove i pozicije. Dvoslovi
LJ, NJ i DŽ su jedan fonem (u LJULJAČKA nema L).

„Konsonantske skupine” postoje samo za R i znače **početnu** suglasničku skupinu: KR-, BR-,
SR-, uključujući slogotvorno R (CRV, BRDO). R u skupini usred riječi (TORBA, VATRA) je
medijalna. Tako je složen i stari katalog: pravilo se poklapa sa 629 od 632 starih putanja.
Preostale tri su legacy odluke ili greške (KRASTAVAC pod C-medijalno).

## Seed

`scripts/seed-katalog.ts` čita `../preuzimanje/data/catalog.csv` i daje `seed/katalog.sql`:
8 glasova, 428 riječi i 715 veza (614 iz starog kataloga, 101 izvedena). Stari nazivi
datoteka su očišćeni: „RAME (TIJELO)” postaje opis, a „BRESKVA (2)” i „SAPUN1” su ista riječ.

## Generiranje

```mermaid
sequenceDiagram
  participant A as Admin
  participant W as Worker (D1, R2)
  participant R as scripts/runner.sh (Mac)
  participant G as agy (tmux, gemini-3.8-flash-low)
  A->>W: Generiraj (riječ ili sve bez slike za glas/poziciju)
  R->>W: POST /api/runner/uzmi
  W-->>R: {id, prompt, rijec}
  R->>G: prompt preko tmux send-keys
  G-->>R: posao-<id>.jpg|png u ~/git/.agy-logomedo
  R->>W: PUT /api/runner/slika/:id (tijelo = slika)
  W->>W: R2 bojanka/<slug>/<hash>.jpg, slike: kandidat
  A->>W: Pregled (A odobri, X odbij + razlog → nova u red)
```

- `agy` radi samo interaktivno, pa runner koristi tmux (isto kao `~/.claude/scripts/agy_glasovna.sh`).
  Gledanje: `tmux attach -t logomedo-agy -r`.
- Posao u stanju `radi` stariji od 15 min vraća se u red. Nakon 3 neuspjeha je `greska`,
  a na stranici Red ide natrag jednim klikom.
- Izmjereno 31. 10. 2026.: RAK, 177 s, JPEG 1024×1024, 220 kB, uredna bojanka iz prvog pokušaja.
  **Za cijeli katalog (428 riječi) to je oko 21 h jednim runnerom.** Više paralelnih runnera
  traži zasebne tmux sesije (`AGY_SESSION`, `AGY_DIR`). `uzmi` je atomaran, pa je to sigurno.
- Kvota: agy je na Google AI Pro pretplati, a ne na Claude kvoti.

## Javne slike (cdn.logomedo.com)

Dva R2 bucketa, isti ključ (`<stil>/<slug>/<16 hex sha256>.<ext>`):

| Bucket | Binding | Sadržaj | Pristup |
|---|---|---|---|
| `logomedo-slike` | `SLIKE` | sve: kandidati, odobrene, odbijene | privatno, admin `/admin/slika/:id` |
| `logomedo-javno` | `JAVNO` | **samo odobrene** | javno, R2 custom domena `cdn.logomedo.com` |

- `odluci()` (`src/lib/generiranje.ts`) nakon svake odluke zove `uskladiJavno()`: odobrena se kopira
  u javni bucket (`cache-control: public, max-age=31536000, immutable`), a slika koja prestane biti
  odobrena (odbijena, vraćena, istisnuta novom) briše se iz njega.
- Javni URL: `https://cdn.logomedo.com/<r2_kljuc>`; u adminu je link „javni URL” na stranici riječi.
  Listanje bucketa preko domene ne postoji, a ključ ima 64-bitni hash, pa se ne da pogoditi.
- Edge cache: zbog `immutable` povučena slika ostaje u cacheu dok se ne očisti. Purge radi samo ako
  postoji secret `CF_PURGE_TOKEN` (API token, Zone → Cache Purge, zona logomedo.com); bez njega
  Worker samo zapiše upozorenje u log.
- Slike odobrene prije uvođenja javnog bucketa (31. 10. 2026.) nisu kopirane same: ponovno ih odobri.

## Runner u pozadini (launchd + push)

- `scripts/launchd/instaliraj.sh` instalira LaunchAgent `com.logomedo.runner` (`runner.sh --prod`,
  KeepAlive, ThrottleInterval 60 s). Log: `~/Library/Logs/logomedo-runner.log`.
  Uklanjanje: `instaliraj.sh --ukloni`. Restart nakon izmjene skripte: `launchctl kickstart -k gui/$(id -u)/com.logomedo.runner`.
- **Push umjesto pollinga.** Na praznom redu runner otvara WebSocket na `/api/runner/zvono`
  (`scripts/runner-cekaj.mjs`, bearer `RUNNER_TOKEN`). Durable Object `RunnerZvono`
  (`src/lib/runner-zvono.ts`, hibernacija, ping/pong bez buđenja) drži vezu; `dodajURed()` i
  „Vrati greške u red” zovu `zazvoni()`. Pri spajanju DO odmah zvoni ako nešto već čeka, a runner
  ionako provjerava red svakih 10 min. `/admin/red` pokazuje je li runner spojen.
- Zašto ne cloudflared tunel prema Macu: treba javni hostname + Access za lokalni servis i još jedan
  proces koji mora živjeti; WebSocket je izlazna veza s Maca, bez ičega otvorenog prema van.
- `src/worker.ts` je vlastiti ulaz (`main` u wrangler.jsonc): `/api/runner/zvono` ide mimo Astra
  (odgovor 101 s WebSocketom), sve ostalo `handle()` iz `@astrojs/cloudflare/handler`.

## SVG (vektorska bojanka)

agy daje samo 1024×1024 (alat ignorira zahtjev za veću rezoluciju; provjereno 31. 10. 2026. na 8
slika). Za ispis (A4 na 300 dpi ≈ 2480 px) runner nakon svake slike zove `scripts/svg.sh`:
ImageMagick prag 50 % → potrace → `PUT /api/runner/svg/:slika_id`. SVG ide u R2 pod istim ključem
s `.svg` (`slike.svg_kljuc`, migracija 0003), a za odobrene i u javni bucket. Tipično ~16 kB.
Worker odbija SVG sa `<script>`, `javascript:` ili `on*=` atributima.

## Kvota agyja (mjereno 31. 10. 2026.)

- Brzina nije usko grlo: 12 slika za redom, 40–53 s po slici (prosjek ~45 s).
- **Kvota alata za slike je.** Nakon 12–13 slika u danu agy javlja
  `429 RESOURCE_EXHAUSTED on gemini-3.1-flash-image` i reset za ~3–5 h (Google AI Pro, prozor
  Antigravityja). Katalog od 428 riječi preko agyja je zato pitanje dana, ne sati.
- Runner to prepoznaje (`KVOTA_RE` u `runner.sh`): posao ide natrag u red bez trošenja pokušaja
  (`POST /api/runner/odgodi/:id`), a runner spava do reseta pročitanog iz poruke
  („at HH:MM UTC” ili „in N hours and M minutes”, inače 30 min).
- Rezolucija je fiksno 1024×1024; zahtjev u promptu za 2K se ignorira (8 slika testirano).
- Otvoreno: Gemini API s plaćenim ključem (isti model, bez prozora, procjena ~$0,04/sliku,
  ≈ $17 za katalog; cijena nije provjerena) kao zamjena za agy pri masovnom generiranju.
  Ne automatizirati gemini.google.com preko preglednika.

## Plan: stilovi, dodaci, referentne slike (dogovoreno 31. 10. 2026., nije napravljeno)

- **Stil** (jedan): `bojanka` (SVG) i novi `ilustracija` (raster u boji); `stilovi.vektor`.
- **Dodaci** u skupinama (kao Adobe Firefly): unutar skupine jedan, skupine se kombiniraju
  (npr. Pozadina: bez; Pogled: sprijeda/profil; Lice: veselo; Boje: pastelne/jarke). Tablica
  `dodaci`, odabir spremljen u `generiranja.dodaci`, živi pregled cijelog prompta u adminu.
  Stil može imati zadane dodatke („blueprint”). Primjer potrebe: astronaut je dobio mjesec,
  raketu i zvjezdice; „bez pozadine” to rješava.
- **Prvo test referentnih slika**: runner agyju da 2–3 odobrene slike stila kao style reference
  (kao Midjourney `--sref`, Leonardo Image Guidance), za dosljednost 428 slika. Provjeriti na
  2–3 riječi prije gradnje UI-ja. Odobrena je zasad samo zebra.
