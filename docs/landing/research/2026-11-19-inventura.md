# Inventura funkcija (S2, 19. 11. 2026.)

Ulaz za `docs/landing/sadrzaj.md`: što LogoMedo danas radi na produkciji, za koga, s dokazom. `sadrzaj.md`
se poziva na ID-eve iz ovog dokumenta (npr. „I-KAT-1”). Landing odluka 10: tvrdi se samo ono što ovdje ima
status „radi na produkciji” (ili „djelomično” uz ogradu).

## Kako je provjereno

- **Što je na produkciji:** zadnji produkcijski deploy Workera `logomedo` je **19. 11. 2026. u 14:13 UTC**
  (`npx wrangler deployments list --name logomedo`, verzija `e8968f33`), minutu nakon commita `16b2a35`
  (15:12 lokalno, „radni listić i slogovi po glasovima uz samoglasnike”). Svi commiti s kodom aplikacije do
  `16b2a35` su dakle na produkciji; kasniji (`c2950d6`, `8566e75`) su samo konfiguracija staginga i docs.
  Prethodni deployi 18. 11. u 20:03 i 20:23 UTC odgovaraju commitima RBAC revizije (`f4c6ac3`, 21:23 lokalno).
- **Datumi i hashevi:** `git log --date=short --format='%h %ad %s' -- <putanja>` (prvi commit = kad je
  funkcija nastala, zadnji = zadnja izmjena). Grana `landing` = `origin/main` (0 commita razlike).
- **Brojke:** staging D1 `logomedo-staging` (kopija produkcije od 19. 11. 2026.), samo `SELECT`, naredbe u
  odjeljku „Brojke”.
- **Javni ulazi (bez prijave) na produkciji**, `curl -s -o /dev/null -w "%{http_code}"`:
  `/` 200, `/admin` 302 → `/admin/login`, `/admin/pregled` 302, `/b/<postojeći slug>` 200 (+ `x-robots-tag: noindex`),
  `/b/<slug>/ispis` 200, `/b/ne-postoji-xyz` 404, `/api/v1/ja` 401, `/admin/poziv` 200 (ekran pozivnice, bez tokena ne radi ništa).
  `staging.logomedo.com/` 401 (Basic Auth).

Legenda „tko”: **SA** = superadmin (e-mail u secretu `ADMIN_EMAILS`), **LP** = logoped s pozivnicom (uloga
`logoped`), **DL** = dijete/roditelj preko linka (bez prijave), **J** = javno (bilo tko).

## Što danas vidi javnost i logoped bez pozivnice

| Što | Putanja | Napomena |
|---|---|---|
| Naslovnica (onepager, 35 redaka) | `/` (`src/pages/index.astro`, `5076044 2026-10-31`, od tada nije mijenjana) | „Novi LogoMedo nastaje…”, 8 slova (C Č L R S Š Z Ž). Spominje samo 8 starih glasova; katalog ih danas ima 30 |
| Prijava | `/admin/login` | Access OTP radi samo za SA; passkey samo za postojeće račune. Bez pozivnice nema registracije |
| Igra i ispis bilježnice **ako netko pošalje link** | `/b/<slug>`, `/b/<slug>/ispis` | link se ne da pogoditi ni pretražiti (noindex); nema popisa bilježnica |
| Pojedinačna odobrena slika **ako netko zna ključ** | `https://cdn.logomedo.com/<r2_kljuc>` | ključ ima 64-bitni hash; listanja nema |

Sve ostalo (katalog, predlošci, editor, PDF zadatka, izgovor, aplikacija) je iza prijave. Logoped bez
pozivnice danas ne može ništa isprobati sam: nema registracije, demo računa ni javnog primjera.

## Inventura

Stupci: **ID** · **Što (jezikom logopeda)** · **Kod** · **Dokaz** · **Tko** · **Status**.

### Katalog slika (I-KAT)

| ID | Što | Kod | Dokaz | Tko | Status |
|---|---|---|---|---|---|
| I-KAT-1 | Katalog slika po glasovima: 30 mapa (25 suglasnika + 5 samoglasnika), složenih po mjestu tvorbe, načinu tvorbe ili zvučnosti | `src/pages/admin/index.astro`, `src/lib/podjele-glasova.ts`, `src/lib/katalog.ts` | `5076044 2026-10-31` (katalog), `6968bdc 2026-11-18` (svih 25 suglasnika, podjele), `eccdf19 2026-11-18` (samoglasnici); `docs/katalog.md` „Podjele glasova” | SA, LP | radi na produkciji |
| I-KAT-2 | Za svaki glas riječi po poziciji: početak (inicijalna), sredina (medijalna), kraj (finalna), a za R i konsonantske skupine (KR-, BR-, slogotvorno R) | `src/pages/admin/glas/[slug].astro`, `src/lib/fonemi.ts` | `5076044 2026-10-31`, zadnja izmjena `eccdf19 2026-11-18`; `docs/katalog.md` „Pozicije” (pravilo se poklapa s 629 od 632 starih putanja) | SA, LP | radi na produkciji |
| I-KAT-3 | Glasovi i pozicije se izvode iz pravopisa (LJ, NJ, DŽ su jedan glas), logoped ih potvrđuje ili miče | `src/lib/fonemi.ts`, `src/pages/admin/rijec/[slug].astro` | `5076044 2026-10-31`; `docs/katalog.md` „Model” (`potvrdeno`) | SA (uređivanje od `357d739 2026-11-18` samo SA) | radi na produkciji |
| I-KAT-4 | Dva stila slike za svaku riječ: **bojanka** (crno-bijela, za bojanje) i **ilustracija** (akvarel u boji); prekidač u katalogu | `stilovi` u D1, `?stil=ilustracija` | `d782ae2 2026-10-31` (stil ilustracija), `6c0f4fd 2026-11-04` (premještanje između stilova); `docs/katalog.md` „Brojke po stilu” | SA, LP | radi na produkciji |
| I-KAT-5 | Stranica riječi: sve slike, odobrene i kandidati, pozicije glasova, rečenica, opis za crtanje, dnevnik izmjena | `src/pages/admin/rijec/[slug].astro` | `5076044 2026-10-31`, zadnja `f4c6ac3 2026-11-18` | SA, LP | radi na produkciji |
| I-KAT-6 | Tražilica riječi (prečac `/`), bez dijakritika (c = č/ć) | `src/pages/admin/api/trazi.ts`, `AdminOkvir.astro` | `f3113df 2026-11-01`; `docs/katalog.md` „Tražilica” | SA, LP | radi na produkciji |
| I-KAT-7 | Nova slika na zahtjev: AI generiranje (Vertex AI, Gemini) u pozadinskom redu, s ispravcima recenzenta u sljedećem pokušaju | `src/lib/generiranje.ts`, `/admin/api/generiraj`, `scripts/runner.sh` | `5076044 2026-10-31`; `docs/katalog.md` „Generiranje”, „Odbij: što ne valja + kako treba” | SA bez limita, LP kroz kvotu (I-RBAC-4) | radi na produkciji (runner radi na Mac miniju, ne u oblaku: vidi „Otvoreno”) |
| I-KAT-8 | Ručni upload vlastite slike za riječ | `src/pages/admin/api/upload.ts` | `f3113df 2026-11-01`; `docs/katalog.md` „Ručni upload” | SA, LP | radi na produkciji |
| I-KAT-9 | Odobravanje slika: pregled kandidata jedan po jedan, Odobri / Odbij („što ne valja”, „kako treba”) / „Slika je za drugu riječ”; više recenzenata istovremeno bez sudara | `src/pages/admin/pregled.astro`, `odluci()` u `src/lib/generiranje.ts` | `5076044 2026-10-31`, zadnja `f4c6ac3 2026-11-18`; `docs/katalog.md` „Pregled s više admina” | SA odlučuje; LP samo o svojim slikama i njegovo „Odobri” je **prijedlog** koji SA potvrđuje (I-RBAC-5) | radi na produkciji |
| I-KAT-10 | Odobrene slike su javno dostupne preko CDN-a (brzo, keširano), a odbijene se odmah miču | `uskladiJavno()` u `src/lib/generiranje.ts`, R2 `logomedo-javno` | `6acc410 2026-10-31`; `docs/katalog.md` „Javne slike” | sustav (igra, PDF, aplikacija) | radi na produkciji |
| I-KAT-11 | Nova riječ (s automatskim glasovima i pozicijama) i novi glas | `src/pages/admin/nova-rijec.astro`, `src/pages/admin/novi-glas.astro` | `26f8ffb 2026-11-01`, `b4ffeb7 2026-11-18` (pretraga dok se piše); `6a41162 2026-11-04` (novi glas) | Nova riječ: SA, LP; Novi glas: SA | radi na produkciji |
| I-KAT-12 | Nepoželjne riječi: popis riječi koje logoped ne želi u katalogu, s razlogom; katalog ih više ne prima | `src/pages/admin/nepozeljne.astro`, `src/lib/nepozeljne.ts` | `5ba3463 2026-11-18`; `docs/katalog.md` „Nepoželjne riječi” | SA uređuje, LP čita | radi na produkciji |
| I-KAT-13 | Situacije: ilustracije scena (npr. „Pečemo kolačiće”), uspravno i vodoravno, za zadatak Scena | `src/pages/admin/situacije.astro`, `src/lib/pozadine*.ts` | `7d1d0f1 2026-11-02` (pozadine), `146e6a6 2026-11-04` (kartica Situacije); `docs/upute-vjezbenice.md` „2. Pozadina” | SA uređuje; LP može tražiti AI sliku kroz kvotu | radi na produkciji |
| I-KAT-14 | Znakovi: slova (velika i mala), brojke i simboli kao zasebne kartice za zadatke (slična slova b/d/p, slovo i slika), font Andika za početno čitanje | `src/pages/admin/znakovi.astro`, `src/lib/znakovi.ts` | `344d542 2026-11-10`, `5cdef78 2026-11-10` (simboli, Andika); `docs/katalog.md` „Znakovi” | SA uređuje, LP koristi u zadacima | radi na produkciji |
| I-KAT-15 | Kvadratne varijante slika (izrez, dopuna, AI) | `scripts/kvadrat.py`, `/api/runner/varijanta` | `7890360 2026-11-08`; `docs/katalog.md` „Kvadratne slike” | SA (skripta) | samo interno (superadmin) |
| I-KAT-16 | Upravljanje promptom, redom generiranja i verzijama prompta | `src/pages/admin/prompt.astro`, `src/pages/admin/red.astro` | `ee10924 2026-11-02`, `5076044 2026-10-31`; `src/lib/admin/rute.ts` `SAMO_SUPERADMIN` | SA | samo interno (superadmin) |

### Zadaci i predlošci (I-ZAD)

Model: vrsta zadatka je kod, zadatak su podaci s verzijama; „mehanika je vrsta, odnos je parametar”
(`docs/zadaci.md` „Vrste zadataka”). Svaka vrsta ima editor, pregled „Dijete rješava”, HTML ispis i PDF, osim
gdje je napisano drukčije. Popis i nazivi vrsta: `VRSTE` u `src/lib/zadaci/vrste.ts`.

| ID | Što | Kod | Dokaz | Tko | Status |
|---|---|---|---|---|---|
| I-ZAD-1 | Predlošci: jedan klik složi gotov zadatak iz kataloga (11 vrsta), zatim se uređuje | `src/pages/admin/predlosci.astro` | `c23cbb3 2026-11-04`, `5ae046a 2026-11-14`, zadnja `16b2a35 2026-11-19`; `docs/zadaci.md` „Predlošci i pregled za dijete” | SA, LP | radi na produkciji |
| I-ZAD-2 | **Radni listić** po glasovima: odaberi glas(ove) i poziciju, isključi glasove („bez L”), „uz samoglasnike” (SOK, ne STOL); naslov se piše sam, do 150 slika, mreža stupaca × redova | `src/lib/zadaci/listic-glas.ts` | `98a3ae9 2026-10-31` (listić), `0e8ba5f 2026-11-14` (po glasovima), `16b2a35 2026-11-19` („uz samoglasnike”, deploy 14:13 UTC); `docs/zadaci.md` status 2026-11-14 | SA, LP (dijalog „Po glasovima…” uz logopedski mod, zadano uključen) | radi na produkciji |
| I-ZAD-3 | **Prebrajanje**: kružići ispod slike, dijete oboji broj slogova ili glasova; ili dugačke i kratke riječi dvjema bojama | vrsta `slogovi` | `c64121b 2026-11-09`, `0230373 2026-11-14` (glasovi); `docs/zadaci.md` „slogovi”, „Prebrajanje” | SA, LP | radi na produkciji |
| I-ZAD-4 | **Uparivanje**: zadana slika, dijete bira jednu od tri koja se rimuje / počinje istim glasom ili slogom / završava istim glasom | vrsta `odabir`, `src/lib/zadaci/odnosi.ts`, `rima.ts` | `98a3ae9 2026-10-31`, `74d4ae2 2026-11-15` (prvi glas, slog, zadnji glas) | SA, LP | radi na produkciji |
| I-ZAD-5 | **Povezivanje**: dva stupca, dijete povezuje parove (rima, prvi glas, slog, zadnji glas; slovo i slika) | vrsta `povezivanje` | `98a3ae9 2026-10-31`, `74d4ae2 2026-11-15` | SA, LP | radi na produkciji |
| I-ZAD-6 | **Izbaci uljeza**: četiri slike, tri idu zajedno | vrsta `uljez` | `98a3ae9 2026-10-31`, `74d4ae2 2026-11-15` | SA, LP | radi na produkciji |
| I-ZAD-7 | **Scena**: ilustracija situacije, dijete bira sve što pripada | vrsta `scena`, `src/lib/scena-prikaz.ts` | `7d1d0f1 2026-11-02`; `docs/zadaci.md` status 2026-11-02 | SA, LP | radi na produkciji |
| I-ZAD-8 | **Vizualna percepcija**: nađi različitu ili dvije iste (zrcaljeno, naopako, okrenuto, manje; i za slova) | vrsta `percepcija` | `247bc72 2026-11-02`, `665d40d 2026-11-02` (na produkciji) | SA, LP | radi na produkciji (varijante s razlikom u detalju: plan, nije napravljeno) |
| I-ZAD-9 | **Prvi glas (kolo slova)**: dijete zavrti kolo, među 12–15 slika nađe sve koje počinju tim glasom; teme boja kola | vrsta `prvi_glas`, `src/lib/kolo-slova.ts` | `8ea5957 2026-11-07`, `23a0d6c 2026-11-07`; `docs/zadaci.md` status 2026-11-07 | SA, LP | radi na produkciji |
| I-ZAD-10 | **Razvrstavanje**: 4–12 slika u 2–4 vreće/košare/kutije po prvom ili zadnjem glasu, broju slogova ili glasova; u igri se slika povlači prstom | vrsta `razvrstavanje`, `src/lib/spremnici.ts` | `5125e21`…`d541b5a 2026-11-17` (migracija 0034 na produkciji), `22b59b5 2026-11-18` (4 vreće) | SA, LP | radi na produkciji |
| I-ZAD-11 | **Koje slovo čuješ?**: igra pusti glas, dijete među razbacanim slovima dodirne ono koje je čulo; na papiru glas izgovara logoped | vrsta `koje_slovo`, `src/lib/zadaci/slusanje.ts` | `ab617e4`, `5a701e6`, `2c5487d`, `d3ef52c`, `1420c2a`, sve `2026-11-18` | SA, LP | **djelomično**: papir radi; u igri glas treba snimku logopeda (I-ZVK-3), a na produkciji ih je 0 |
| I-ZAD-12 | **Gdje je glas?**: ispod slike tri kruga (početak, sredina, kraj) | vrsta `pozicija_glasa` | isti commiti kao I-ZAD-11 | SA, LP | **djelomično** (isto kao I-ZAD-11; papir radi) |
| I-ZAD-13 | Uređivač zadatka s verzijama, „Složi automatski”, provjere (npr. rima), odabir stila slika (bojanka/ilustracija) | `src/pages/admin/zadaci/[id]/index.astro`, `src/lib/zadaci/*` | `ca8ffff 2026-11-14`, `2f0e869 2026-11-03` (stil po zadatku) | SA, LP (samo svoje zadatke) | radi na produkciji |
| I-ZAD-14 | „Dijete rješava”: zadatak u novoj kartici točno kao u igri, i prije spremanja | `src/pages/admin/zadaci/[id]/dijete.astro`, `src/components/IgraDjeteta.astro` | `ca8ffff 2026-11-14`; `docs/zadaci.md` „Predlošci i pregled za dijete” | SA, LP | radi na produkciji |
| I-ZAD-15 | Gotovi zadaci: popis po područjima, meko brisanje i vraćanje | `src/pages/admin/zadaci/index.astro` | `98a3ae9 2026-10-31`, `c23cbb3 2026-11-04` | SA, LP (svoje) | radi na produkciji |
| I-ZAD-16 | Djeca, spremanje rješavanja i praćenje napretka | tablice `djeca`, `rjesavanja` (0 redaka) | `docs/zadaci.md` „Opseg” i status 2026-10-31: „Djeca i spremanje rješavanja još nemaju UI” | — | **nije napravljeno** (samo model u bazi) |

### Ispis i PDF (I-PDF)

| ID | Što | Kod | Dokaz | Tko | Status |
|---|---|---|---|---|---|
| I-PDF-1 | „Preuzmi PDF” za svaki zadatak: A4 složen u pregledniku (bez slanja na poslužitelj), 1:1 s pogledom Ispis | `src/lib/pdf/ispis-pdf.ts`, `model.ts`, `preglednik.ts`, `src/lib/zadaci/klijent.ts` | `de51042 2026-11-01`, zadnja `d3ef52c 2026-11-18`; `docs/zadaci.md` status 2026-11-07 („PDF složen”) | SA, LP | radi na produkciji |
| I-PDF-2 | Pogled Ispis (A4 na ekranu) i stranice 2..N po mreži listića | `src/pages/admin/zadaci/[id]/index.astro` (kartica Ispis) | `6cf651e 2026-11-14`, `8163929 2026-11-14` | SA, LP | radi na produkciji |
| I-PDF-3 | Ispis cijele bilježnice: naslovnica s borom/stablom za bojanje (dijete oboji lampicu za svaki riješen red) | `src/pages/b/[slug]/ispis.astro` | `56732db 2026-10-31`, `b583fad 2026-11-02` (teme); `docs/upute-vjezbenice.md` „Ispis” | DL (s linkom), SA, LP | radi na produkciji |
| I-PDF-4 | Napomena: `docs/pdf/` sadrži samo `upute-vjezbenice.pdf` (I-UPU-1), ne kod ispisa | — | `8e04fa1 2026-11-02` | — | — |

### Okviri (I-OKV)

| ID | Što | Kod | Dokaz | Tko | Status |
|---|---|---|---|---|---|
| I-OKV-1 | Ukrasni okviri radnog listića za ispis: rub (kockice, pruge), mašna, ukrasi u 4 kuta (medvjedić, snjegović, imela…), 3 gotova okvira; štedi tintu (uzorak 5 mm od ruba, svijetle boje) | `src/lib/okviri.ts`, `public/okviri/*.png` (12 ukrasa) | `c4d611b 2026-11-15`, `605fb13 2026-11-15`, `3acd741 2026-11-15`; `docs/okviri.md` „Status (2026-11-15): na produkciji” | SA, LP | radi na produkciji (samo papir; igra ga nema). Ukrasi su zasad samo božićni |

### Bilježnice i igra za dijete (I-BIL)

| ID | Što | Kod | Dokaz | Tko | Status |
|---|---|---|---|---|---|
| I-BIL-1 | Bilježnica (vježbenica): niz zadataka s temom i javnom poveznicom; logoped slaže redoslijed i vidi koji zadatak „nije spreman za igru” | `src/pages/admin/biljeznice/*.astro`, `src/lib/biljeznice.ts` | `56732db 2026-10-31`, `b583fad 2026-11-02`; `docs/biljeznice.md` „Nova bilježnica i teme (… na produkciji)” | SA, LP (samo svoje) | radi na produkciji |
| I-BIL-2 | Igra za dijete na tabletu ili mobitelu, bez prijave: „Kreni”, pitanje se pročita, točno = zelena kartica + zvonce + lampica na boru; na kraju „Bravo!” i „Ponovi” | `src/pages/b/[slug].astro`, `src/components/IgraDjeteta.astro`, `src/lib/biljeznice-igra.ts`, `biljeznice-ekrani.ts` | `56732db 2026-10-31`, `942f90a 2026-11-07` (ilustrirane pozadine), zadnja `f4c6ac3 2026-11-18`; curl `/b/<slug>` 200 | DL | radi na produkciji |
| I-BIL-3 | Teme igre: **Božić** (bor s lampicama) i **Proljeće** (stablo s jabukama), uspravno i vodoravno | `src/lib/teme.ts`, `public/igra/*.webp` | `4d46d05`/`b583fad 2026-11-02`, `942f90a 2026-11-07` | DL | radi na produkciji |
| I-BIL-4 | Privatnost igre: o djetetu se ništa ne sprema ni šalje; stranica ima `noindex` | `src/pages/b/[slug].astro:11` (`x-robots-tag`) | `f4c6ac3 2026-11-18`; `docs/biljeznice.md` „Pristup”; `docs/upute-vjezbenice.md` „5. Rad s djetetom”; curl zaglavlje `x-robots-tag: noindex` | DL | radi na produkciji |
| I-BIL-5 | Ispis bilježnice: vidi I-PDF-3 | | | | |

Koje vrste igra crta: sve osim listića („Listić u igri nema ekran”, `docs/zadaci.md`). Scena bez pozadine i
nepotpuni redovi se preskaču (`biljeznice-ekrani.ts`).

### Izgovor i slušne vježbe (I-ZVK)

| ID | Što | Kod | Dokaz | Tko | Status |
|---|---|---|---|---|---|
| I-ZVK-1 | Izgovor riječi, uputa i rečenica hrvatskim AI glasom (ElevenLabs); svaku snimku automatski provjeri prepoznavanje govora, a čovjek je odobri | `src/lib/elevenlabs.ts`, `zvukovi.ts`, `zvukovi-tekst.ts`, `src/pages/admin/zvukovi.astro`, Cloudflare Queue | `f40f17b 2026-11-04`, `5963cde 2026-11-14` (kratke riječi na hrvatskom); `docs/zvukovi.md` „Produkcija” | SA; LP kroz kvotu (samo tekst bez odobrene snimke) | radi na produkciji |
| I-ZVK-2 | Igra govori samo odobrene snimke; tekst bez snimke nema zvučnik (glas preglednika je uklonjen) | `odobreniZvukovi`, `IgraDjeteta.astro` | `docs/zvukovi.md` (14. 11. 2026.); `docs/zadaci.md` „Predlošci i pregled za dijete” | DL | radi na produkciji, ali **74 odobrena teksta** (vidi Brojke): većina riječi u igri još nema zvuk |
| I-ZVK-3 | Snimke izoliranih glasova („sss”, ne „es”) koje snima logoped u pregledniku, za slušne vrste | `src/pages/admin/zvukovi/snimke.astro` | `5a701e6 2026-11-18`; `docs/zvukovi.md` „Snimke glasova” | SA snima, LP čita | **djelomično**: kod na produkciji, snimki 0 |
| I-ZVK-4 | Izbor AI glasa i probe glasova s ocjenama | `src/pages/admin/zvukovi/glasovi.astro`, `src/lib/zvuk-probe.ts` | `5963cde 2026-11-14` | SA | samo interno (superadmin) |

### Flutter aplikacija (I-APP)

| ID | Što | Kod | Dokaz | Tko | Status |
|---|---|---|---|---|---|
| I-APP-1 | Android aplikacija za pregled kataloga, upload iz galerije i odluke o slikama | `../app`, `/api/v1/admin/*` (`src/pages/api/v1/`) | app `c0aed47 2026-11-01`; web `3cccc9d 2026-11-01`; `../app/docs/arhitektura.md` „Što se gdje radi”; `docs/app-api.md` | samo SA (`/api/v1/admin/*` traži ulogu admin, `src/middleware.ts:117`) | samo interno (superadmin) |
| I-APP-2 | Vježbenice u aplikaciji: bilježnice i zadatak; renderer postoji samo za Scenu, ostale vrste „još nije u aplikaciji” | `../app` `scena.dart` | app `6b2103d 2026-11-02`, zadnji app commit `656d8e1 2026-11-04`; `../app/docs/arhitektura.md` „Vježbenice: što je napravljeno” | SA | samo interno; **djelomično** |
| I-APP-3 | Trgovine | — | `../app/docs/arhitektura.md`: iOS „nije buildan”, treba Apple Developer račun; za Android nigdje nema Play objave (instalacija na uređaj ručno) | — | **nije u trgovinama** (ni Play ni App Store) |

### Logopedi: pozivnice, uloge, AI kvota (I-RBAC)

| ID | Što | Kod | Dokaz | Tko | Status |
|---|---|---|---|---|---|
| I-RBAC-1 | Dvije uloge: superadmin i logoped. Logoped vidi katalog i radi svoje zadatke i bilježnice (tuđe ne vidi), administracija mu je zatvorena | `src/lib/admin/ovlasti.ts`, `rute.ts`, `vlasnistvo.ts`, `src/middleware.ts` | `d10369e`…`66e16a9 2026-11-16`, deploy `4ed58f25`; `docs/rbac/handoffs/README.md` (S5 gotovo); `docs/admin.md` „Uloge i pozivnice” | SA, LP | radi na produkciji |
| I-RBAC-2 | Pozivnica: jednokratni link (72 h), logoped njime registrira passkey i odmah je prijavljen | `src/pages/admin/poziv.astro`, `src/lib/admin/pozivi.ts` | `b46c02f 2026-11-16`, `9694cf3 2026-11-18` | SA izdaje, LP koristi | radi na produkciji (alfa; pozivnice izdaje SA ručno) |
| I-RBAC-3 | Popis korisnika: pozivnice, deaktivacija, limiti, potrošnja i doprinos | `src/pages/admin/korisnici.astro` | `b46c02f 2026-11-16`, `da3f4a3 2026-11-18` | SA | samo interno (superadmin) |
| I-RBAC-4 | AI kvota po logopedu (klizni 7 dana; nova pozivnica 20 slika i 50 izgovora), preostalo u bočnoj traci | `src/lib/kvota.ts` | `34d4766 2026-11-16`, `0cd2281 2026-11-16`; `docs/admin.md` „Limit” | LP | radi na produkciji |
| I-RBAC-5 | Logopedovo „Odobri” je prijedlog; superadmin ga vidi prvog i potvrđuje | `slike.predlozio` (migracija 0037), `pregled.astro` | `f4c6ac3 2026-11-18`; `docs/rbac/decisions.md` 606 | LP predlaže, SA potvrđuje | radi na produkciji |

Stanje alfe: `docs/rbac/2026-11-18-revizija-logoped-alfa.md` „Otvoreno”: ručna provjera s testnim logoped računom
još nije napravljena; brojke stanja na Katalogu su globalne (604 c).

### Prijava, aktivnost, postavke (I-PRI, I-AKT, I-ADM)

| ID | Što | Kod | Dokaz | Tko | Status |
|---|---|---|---|---|---|
| I-PRI-1 | Prijava bez lozinke: passkey (otisak prsta, Face ID, PIN uređaja) | `src/lib/admin/*`, `src/pages/admin/passkey/*`, `/admin/passkeys` | `5076044 2026-10-31`; `docs/admin.md` | SA, LP | radi na produkciji |
| I-PRI-2 | Superadmin se prijavljuje i kodom na e-mail (Cloudflare Access) | `src/pages/admin/sso.ts` | `docs/admin.md` „Produkcija (31. 10. 2026.)” | SA | samo interno (superadmin) |
| I-PRI-3 | Sigurnost: sesija 12 h / 2 h neaktivnosti, CSRF po Originu, CSP s nonceom, u bazi samo hashevi | `src/middleware.ts`, `src/lib/admin/*` | `docs/admin.md` uvod | sustav | radi na produkciji |
| I-AKT-1 | Dnevnik aktivnosti: tko je što promijenio u katalogu i bilježnicama, s „Poništi” i „Vrati na ovo” | `src/pages/admin/aktivnost.astro`, `src/components/Aktivnost.astro`, `src/lib/aktivnost.ts` | `f96684a 2026-11-01`, `fcbf7fb 2026-11-18`; `docs/aktivnost.md` | SA sve; LP vidi svoje i vraća samo svoje bilježnice | radi na produkciji |
| I-ADM-1 | Postavke: ime i prezime, logopedski mod (dijalog „Po glasovima…”) | `src/pages/admin/postavke.astro` | `f0b4eb0 2026-11-14`, `ed947e2 2026-11-18` | SA, LP | radi na produkciji |
| I-ADM-2 | Bočna traka po poslu (Odobravanje, Sadržaj, Vježbe), sklapanje, mobitel | `src/components/AdminOkvir.astro` | `docs/admin.md` „Bočna traka” | SA, LP | radi na produkciji („Početna” iz dizajna nije napravljena) |

### Upute (I-UPU) i javno (I-JAV)

| ID | Što | Kod | Dokaz | Tko | Status |
|---|---|---|---|---|---|
| I-UPU-1 | Upute za logopede „Kako napraviti vježbenicu” (5 koraka, rad s djetetom, česta pitanja), MD i PDF | `docs/upute-vjezbenice.md`, `docs/pdf/upute-vjezbenice.pdf` | `8e04fa1 2026-11-02` | dijeli se ručno; nije na webu | samo dokument u repou (opisuje stanje 2. 11.: ne spominje vrste nakon scene) |
| I-JAV-1 | Javna naslovnica | `src/pages/index.astro` | `5076044 2026-10-31`; curl `/` 200 | J | radi na produkciji (onepager, zastario sadržaj) |

## Brojke (staging D1, kopija produkcije 19. 11. 2026.)

Sve naredbe iz korijena repoa: `CLOUDFLARE_ACCOUNT_ID=7dc7167b7e2e00923bfa7cd697df14e4 npx wrangler d1 execute logomedo-staging --remote --config wrangler.jsonc --env staging --json --command "<upit>"`.

| Brojka | Vrijednost | Upit |
|---|---|---|
| Glasova u katalogu | **30** (25 suglasnika + A E I O U); svih 30 ima riječi | `SELECT COUNT(*) FROM glasovi`; `SELECT COUNT(DISTINCT glas_id) FROM rijec_glas rg JOIN rijeci r ON r.id=rg.rijec_id WHERE r.aktivna=1` |
| Redoslijed glasova | C S Z Č Š Ž L R K Đ DŽ G M B P V F T D N J LJ NJ Ć H A E I O U | `SELECT group_concat(oznaka,' ') FROM (SELECT oznaka FROM glasovi ORDER BY redoslijed)` |
| Aktivnih riječi (slike) | **659** (425 iz starog kataloga, 234 dodane) | `SELECT vrsta, COUNT(*) FROM rijeci WHERE aktivna=1 GROUP BY vrsta`; `SELECT izvor, COUNT(*) FROM rijeci WHERE aktivna=1 AND vrsta='rijec' GROUP BY izvor` |
| Znakova (slova, brojke, simboli) | **90** | isti upit, `vrsta='znak'` |
| Riječi s barem jednom odobrenom slikom | **655** od 659 | `SELECT COUNT(DISTINCT s.rijec_id) FROM slike s JOIN rijeci r ON r.id=s.rijec_id WHERE s.status='odobrena' AND r.aktivna=1` |
| Veza glas × pozicija | inicijalna 616, medijalna 2161, finalna 659, skupina (R) 133 | `SELECT pozicija, COUNT(*) FROM rijec_glas GROUP BY pozicija` |
| Riječi na početku, po glasu (raspon) | S 80, P 59, Š 40, K 40, R 33, L 33 … DŽ 7, Đ 5, Ć 3, NJ 3 | `SELECT g.oznaka, COUNT(*) FROM rijec_glas rg JOIN glasovi g ON g.id=rg.glas_id JOIN rijeci r ON r.id=rg.rijec_id WHERE r.aktivna=1 AND rg.pozicija='inicijalna' GROUP BY g.oznaka ORDER BY 2 DESC` |
| Odobrenih slika | **1320**: ilustracija 664, bojanka 656 (još 9 kandidata, 313 odbijenih) | `SELECT status, COUNT(*) FROM slike GROUP BY status`; `SELECT st.kod, COUNT(*) FROM slike s JOIN stilovi st ON st.id=s.stil_id WHERE s.status='odobrena' GROUP BY st.kod` |
| Stilova | 2 (bojanka, ilustracija) | `SELECT kod, naziv, aktivan FROM stilovi` |
| Vrsta zadataka (u kodu) | **11** | `VRSTE` u `src/lib/zadaci/vrste.ts` (D1 `CHECK` na `zadaci.vrsta`) |
| Područja (taksonomija) | 12 (3 glavna, 9 podpodručja) | `SELECT COUNT(*) FROM podrucja` |
| Zadataka (nisu obrisani) | **67** (165 verzija): slogovi 17, listić 15, povezivanje 9, odabir 8, scena 8, prvi_glas 5, percepcija 3, razvrstavanje 1, uljez 1, koje_slovo 0, pozicija_glasa 0; svi `privatno` | `SELECT vrsta, COUNT(*) FROM zadaci WHERE obrisan_at IS NULL GROUP BY vrsta`; `SELECT COUNT(*) FROM zadatak_verzije` |
| Zadataka s okvirom | 1 | `SELECT COUNT(*) FROM zadaci WHERE okvir IS NOT NULL AND obrisan_at IS NULL` |
| Bilježnica | **6** (sve javne, tema božić, stil ilustracija; 15 veza zadatak–bilježnica) | `SELECT tema, javna, COUNT(*) FROM biljeznice GROUP BY tema, javna`; `SELECT COUNT(*) FROM biljeznica_zadaci` |
| Situacija | 9 (7 s obje orijentacije, 17 slika) | `SELECT COUNT(*) FROM pozadine WHERE obrisan_at IS NULL`; `SELECT COUNT(*) FROM (SELECT pozadina_id FROM pozadina_slike GROUP BY pozadina_id HAVING COUNT(*)>=2)` |
| Odobrenih izgovora | **74** različita teksta, svi ElevenLabs (`eleven_v4`); 8 kandidata, 60 odbijenih | `SELECT status, COUNT(*) FROM zvukovi GROUP BY status`; `SELECT COUNT(DISTINCT kljuc) FROM zvukovi WHERE status='odobren'` |
| Snimki glasova (logoped) | **0** | `SELECT status, COUNT(*) FROM zvukovi WHERE kljuc LIKE '/s/%' OR model='snimka' GROUP BY status` |
| Nepoželjnih riječi | 14 | `SELECT COUNT(*) FROM nepozeljne_rijeci` |
| Logopeda (uloga `logoped`, aktivni) | **1** | `SELECT uloga, aktivan, COUNT(*) FROM korisnici GROUP BY uloga, aktivan` (bez stupaca s osobnim podacima) |
| Računa s ulogom `admin` u tablici | 2 (superadmin se određuje secretom, ne tablicom) | isti upit |
| Pozivnica | 2 (1 iskorištena, 1 opozvana) | `SELECT (iskoristena_at IS NOT NULL), (opozvana_at IS NOT NULL), COUNT(*) FROM pozivi GROUP BY 1,2` |
| Djece / rješavanja | 0 / 0 | `SELECT COUNT(*) FROM djeca`; `SELECT COUNT(*) FROM rjesavanja` |
| Zapisa aktivnosti | 4616 (1.–19. 11. 2026.) | `SELECT COUNT(*), MIN(at), MAX(at) FROM aktivnost` |
| Sesija aplikacije | 2 | `SELECT COUNT(*) FROM app_sesije` |

Za landing su sigurne: **30 glasova, ~660 riječi, 1300+ odobrenih slika u dva stila, 11 vrsta zadataka, 90 znakova,
tema Božić i Proljeće**. Broj izgovora (74) je premalen za tvrdnju „svaka riječ se izgovara”.

## Ilustracije za landing (cdn.logomedo.com)

**Ključ:** `slike.r2_kljuc` = `<stil>/<slug riječi>/<16 hex sha256>.<ext>`, a javni URL je
`https://cdn.logomedo.com/<r2_kljuc>` (`docs/katalog.md` „Javne slike”). Javni bucket `logomedo-javno` drži
**samo odobrene**, `cache-control: public, max-age=31536000, immutable`. Slug riječi transliterira dijakritike
(č → `ch`, ž → `zh`, š → `sh`, ć → `cj`, đ → `dj`, dž → `dz`).

Upit: `SELECT r.rijec, s.r2_kljuc, s.sirina, s.visina FROM slike s JOIN rijeci r ON r.id=s.rijec_id JOIN stilovi st ON st.id=s.stil_id WHERE s.status='odobrena' AND st.kod='ilustracija' AND r.rijec IN (...)`.
Provjera: `curl -sI https://cdn.logomedo.com/<kljuc>` → sve ispod **200**, PNG 1024 × 1024, 0,9–1,4 MB (ilustracija) i
0,2–0,3 MB (bojanka).

| Riječ | Glas (pozicija) | Ključ (ilustracija) |
|---|---|---|
| RIBA | R (početak) | `ilustracija/riba/08b78c1b64f7ace1.png` |
| SUNCE | S (početak), C (sredina) | `ilustracija/sunce/7b78ac6aeb220458.png` |
| ŽABA | Ž (početak) | `ilustracija/zhaba/5bd3da7ad6c5afb4.png` |
| LAV | L (početak) | `ilustracija/lav/64116adb7fe6882d.png` |
| ZEC | Z (početak), C (kraj) | `ilustracija/zec/eea90bc31144fe9c.png` |
| ŠEŠIR | Š (početak i sredina), R (kraj) | `ilustracija/sheshir/10c1b4aeeab0e75d.png` |
| ČARAPA | Č (početak) | `ilustracija/charapa/a0228a310339a9f4.png` |
| KUĆA | K (početak), Ć (sredina) | `ilustracija/kucja/13173c2b48ddb95a.png` |
| ĐAK | Đ (početak) | `ilustracija/djak/efe2a8c065252eb3.png` |
| DŽEM | DŽ (početak) | `ilustracija/dzem/bf5082404febc5e6.png` |
| ŽIRAFA | Ž (početak), F (sredina) | `ilustracija/zhirafa/a8f5bfc0c09f4158.png` |
| SOVA | S (početak) | `ilustracija/sova/25415d78d2f71e60.png` |
| MIŠ | M (početak), Š (kraj) | `ilustracija/mish/c033416244ccab9b.png` |
| RAK | R (početak), K (kraj) | `ilustracija/rak/3fa0789de9126528.png` |

Rezerva (također 200): `ilustracija/jabuka/951cda6bed2961db.png`, `ilustracija/kljuch/0bbf4f1003a29997.png`,
`ilustracija/ruzha/9b9848c225d9b847.png`, `ilustracija/fen/ad21ec2a6d859eaf.png`, `ilustracija/lopta/5b4f9e4aa09f0489.png`,
`ilustracija/cvijet/bf45ea5ff7816899.png`, `ilustracija/sir/f59f827faed62e8e.png`.
Isti par u bojanci (za usporedbu stilova): `bojanka/riba/92c77de0ca525f8a.png`, `bojanka/sunce/98eabebff5090197.png`,
`bojanka/zhaba/a80fd041229e8a4a.jpg`, `bojanka/lav/7a1d70956540038b.jpg`.

Pozicije u tablici su izvedene iz pravopisa (I-KAT-3), ne iz upita: prije objave ih potvrditi na stranici riječi.
Ako se riječi kasnije dodaju nove odobrene slike, ovaj ključ i dalje vrijedi dok slika ne bude odbijena.

## Stranice za snimke zaslona (staging) i osobni podaci na njima

Snimke na stagingu traže admin sesiju (`scripts/staging-sesija.sh`, `docs/staging.md`). Na **svakoj admin**
stranici je bočna traka s računom: `AdminOkvir.astro` → `.tko` (atribut `title` s e-mailom), `.tko .avatar`
(prvo slovo e-maila), `.tko .email`, `.tko .uloga`. Snimati kao logoped (sesija bez `--superadmin`) uklanja
većinu „Poslao” elemenata, jer su oni samo za superadmina; e-mail u traci ostaje i treba ga sakriti ili
izrezati.

| Stranica | Što pokazuje (za landing) | Osobni podaci i selektori |
|---|---|---|
| `/admin` (katalog), `?stil=ilustracija`, `?podjela=` | mape 30 glasova s brojevima, prekidač stila | samo traka (`.tko`) |
| `/admin/glas/<s, r, z…>?stil=ilustracija` | riječi glasa po pozicijama, sa slikama | samo traka |
| `/admin/rijec/<riba>` | sve slike riječi, pozicije, dnevnik | `.podnaslov` „Dodao: …” (SA), `.poslao` (SA, „Poslao: …”), `.oznaka.uspjeh` „Predlaže odobrenje: …” (SA), komponenta Aktivnost (`.avatar[title]` = e-mail, `.opis-grupe .sitno` = dio e-maila prije @), `details.prompt` (bez osobnih podataka) |
| `/admin/pregled` | odobravanje slike, tipke Odobri / Odbij | `form.filtar-korisnika select#korisnik` (imena i e-mailovi, SA), `#poslao` („Poslao: ime”, „predlaže odobrenje (ime)”), poruka „X je već odobrio” |
| `/admin/zvukovi` | izgovor s provjerom, Odobri/Odbij | `select#korisnik` (SA), `.poslao` (SA), e-mail recenzenta u `.sitno.blijedo` na tabovima Odobreno/Odbijeno (SA) |
| `/admin/predlosci` | 11 kartica vrsta, dijalog „Po glasovima…” | samo traka |
| `/admin/zadaci` | popis gotovih zadataka | stupac „Autor” (`th`/`td`, samo SA); naslovi zadataka mogu sadržavati ime djeteta: provjeriti |
| `/admin/zadaci/<id>` (Uredi, **Okvir**, **Ispis**) | editor, okviri, A4 pregled | naslov zadatka; na Ispisu crta „Ime: ____” je prazna |
| `/admin/zadaci/<id>/dijete` | igra točno kao dijete vidi | naslov zadatka |
| `/admin/biljeznice`, `/admin/biljeznice/<id>` | bilježnica, redoslijed, stanje slika | stupac „Autor” (SA), **stupac/polje „Poveznica”** (`#slug`, stvarni slug: ne smije na snimku), naslov/podnaslov |
| `/b/<slug>` (vodoravno i uspravno, tema Božić i Proljeće) | igra: kartice, bor, „Bravo!” | naslov i podnaslov bilježnice; **slug u adresnoj traci**. Za snimku napraviti probnu bilježnicu neutralnog naslova na stagingu (ili koristiti `/admin/zadaci/<id>/dijete`) |
| `/b/<slug>/ispis` | A4 naslovnica s borom za bojanje | naslov bilježnice; `.ime` je prazna crta |
| `/admin/situacije` | ilustracije scena | bez osobnih podataka u prikazu (autor se ne ispisuje) |
| `/admin/znakovi`, `/admin/nepozeljne` | slova u Andiki, popis s razlozima | ne ispisuju tko je dodao; razlozi su slobodan tekst: pregledati |
| **Ne snimati** | `/admin/korisnici`, `/admin/aktivnost`, `/admin/postavke`, `/admin/passkeys`, `/admin/poziv`, `/admin/red`, `/admin/prompt` | e-mailovi, imena, ključevi, recenzije |

## Prijedlozi odluka (za blok 200)

1. **Landing smije tvrditi** (radi na produkciji): katalog 30 glasova po pozicijama i skupinama; dva stila
   (bojanka, ilustracija); 1300+ odobrenih slika koje pregledava logoped; 11 vrsta zadataka iz jednog klika
   (I-ZAD-1…10); PDF i ispis s okvirima; igra za dijete na tabletu bez prijave i bez spremanja podataka o
   djetetu; teme Božić i Proljeće; znakovi s fontom za početno čitanje; prijava passkeyem.
2. **„Uskoro” ili uz ogradu:** „Koje slovo čuješ?” i „Gdje je glas?” u igri (nema snimki glasova; papir
   radi); izgovor riječi (74 teksta: pisati „izgovor uputa i odabranih riječi”, ne „svake riječi”);
   aplikacija za Android i iOS (postoji, ali samo za superadmina i nije u trgovinama: na landingu „uskoro”
   ili izostaviti); praćenje djeteta i napretka (I-ZAD-16).
3. **Landing ne smije tvrditi:** da je aplikacija u Google Playu / App Storeu; da logoped može sam
   napraviti račun (samo pozivnica, alfa); da se rezultati djeteta spremaju; da je katalog „besplatan” ili
   ima cijenu (nigdje nije definirano); da AI generira slike „na zahtjev bez ograničenja” (kvota, i runner
   na lokalnom računalu).
4. **CTA:** dok nema registracije, landing logopedu nudi „Zatraži pristup (alfa)” uz kontakt (otvoreno
   pitanje vrata S6, landing odluka 14), a „Prijava” vodi na `/admin/login`.
5. **Demo bez prijave:** jedina javna demonstracija je `/b/<slug>`. Predlažem posebnu demo bilježnicu
   neutralnog naslova (npr. 3–4 zadatka s ilustracijama i odobrenim izgovorom) za link „Isprobaj igru”;
   napraviti je na produkciji tek u S6 nakon „go” (pisanje u D1).
6. **Slike na landingu:** CDN slike su PNG ~1 MB; za landing ih preuzeti jednom, smanjiti u `.webp`
   (npr. 512 px) i servirati iz `public/landing/` (landing odluka 15), a ne izravno s CDN-a.
7. **Naslovnica `/`** danas spominje 8 glasova (C Č L R S Š Z Ž) i „Novi LogoMedo nastaje”: novi landing
   to zamjenjuje.

## Otvoreno

- **Runner slika** radi na Mac miniju (`scripts/runner.sh`, launchd, `docs/katalog.md` „Runner u pozadini”): ako
  računalo ne radi, AI slike čekaju u redu. Nisam provjeravao radi li danas; za landing nije tvrdnja, ali utječe
  na „slika na zahtjev”.
- **Android aplikacija:** u `../app` nema traga objave (Play internal testing ili slično); nisam gledao Play
  Console. Pretpostavka: samo ručna instalacija.
- **Igra na produkciji za vrste nakon 7. 11.** (razvrstavanje, slušne vrste) provjerena je u commitima i
  lokalno, ali nisam našao zapis ručne provjere na produkciji kao za `prvi_glas` i `percepcija`.
- **Bilježnice:** sve 6 su tema Božić; tema Proljeće postoji u kodu, ali nijedna bilježnica je ne koristi.
  Za snimku Proljeća treba probna bilježnica na stagingu.
- **Glasovi `koje_slovo` / `pozicija_glasa`** imaju 0 zadataka; je li na papiru izgled dovoljno dobar za
  snimku, treba pogledati na stagingu.
- **Brojke kataloga** na stagingu su kopija od 19. 11.; prije objave (S6) ponoviti upite na produkciji
  (samo čitanje) ili zaokružiti („650+ riječi”, „1300+ slika”).
- `korisnici.uloga='admin'` (2 retka) ne mora odgovarati broju superadmina (secret `ADMIN_EMAILS`); nisam čitao secret.
- `docs/upute-vjezbenice.md` je od 2. 11. i ne opisuje vrste dodane kasnije; ako landing linka upute, treba ih osvježiti.
