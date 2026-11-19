# Sadržaj landinga (S2, 19. 11. 2026.)

## 1. Uvod

**Svrha.** Ovo je konačan tekst višestraničnog landinga na `logomedo.com`: arhitektura stranica, tekst svake
sekcije, popis vizuala, otvorena pitanja za vrata S6 i prijedlozi odluka. S3 (kostur, naslovna), S4 (katalog,
radni listići, snimke) i S5 (igre, o nama, privatnost, 404) grade stranice **odavde**: tekst se prenosi doslovno,
a mijenja se samo ovdje (pa tek onda u kodu).

**Pravilo tvrdnji** (landing odluka 10). Svaka tvrdnja ima referencu na
`docs/landing/research/2026-11-19-inventura.md`. Što je u inventuri „djelomično”, „samo interno” ili „nije
napravljeno” piše se kao „uskoro” ili se izostavlja.

**Legenda referenci.**

| Oznaka | Značenje |
|---|---|
| `[I-KAT-4]` | redak inventure s tim ID-em (I-KAT, I-ZAD, I-PDF, I-OKV, I-BIL, I-ZVK, I-APP, I-RBAC, I-PRI, I-AKT, I-ADM, I-UPU, I-JAV) |
| `[B: Odobrenih slika]` | redak tablice „Brojke” u inventuri (staging, kopija produkcije 19. 11.) |
| `[PO-3]` | stavka „Prijedlozi odluka” u inventuri (npr. 3 = „ne smije tvrditi”) |
| `[LO-14]` | landing odluka iz `docs/landing/decisions.md` |
| `[OP-n]` | otvoreno pitanje iz odjeljka 5 ovog dokumenta; tekst se ne objavljuje dok nije odgovoreno |
| `[V-n]` | vizual iz odjeljka 4 |

**Placeholderi** (ne objavljuju se doslovno; S6 ih zamjenjuje ili uklanja cijeli element):
`[KONTAKT — S6]`, `[IME TVRTKE — S6]`, `[DEMO — S6]` (putanja `/b/<demo-slug>`), `[GODINA — S6]`.

**Brojke** su zaokružene i stoje na jednom mjestu u kodu (prijedlog odluke 3). U S6 se ponavljaju upiti iz
inventure na produkciji (samo čitanje) [OP-7].

| Na landingu | Izvor | Stvarno (staging 19. 11.) |
|---|---|---|
| 30 glasova | [B: Glasova u katalogu] | 30 |
| 650+ riječi | [B: Aktivnih riječi], [B: Riječi s barem jednom odobrenom slikom] | 659 / 655 sa slikom |
| 1300+ slika | [B: Odobrenih slika] | 1320 |
| 2 stila | [B: Stilova] | 2 |
| 11 vrsta zadataka | [B: Vrsta zadataka] | 11 |
| 90 znakova | [B: Znakova] | 90 |
| 2 teme igre | [I-BIL-3] | Božić, Proljeće |

**Ton.** Kratko, toplo, za logopede, bez tehničkog žargona (uzor: „Slike za svaki glas. Listić za tren.” iz
današnjeg `src/pages/index.astro`). Logopedu se obraća s „vi” (malo slovo, kao na webu). Riječi koje se ne
koriste: D1, R2, Worker, API, CDN, Vertex, Gemini, ElevenLabs, model, server. „AI” se ne spominje; nova slika
na zahtjev opisuje se kao „zatražite novu sliku” uz ogradu tjednog limita [I-KAT-7], [I-RBAC-4], [PO-3].

---

## 2. Arhitektura

### 2.1 Stranice

Sve stranice su prerenderirane [LO-1]. Nijedna ne počinje s `/admin`, `/api`, `/b` ni `/cdn`.

| Putanja | Svrha | Primarni CTA | Sekundarni CTA | `<title>` | Meta description | Sitemap |
|---|---|---|---|---|---|---|
| `/` | Što je LogoMedo, tri stupa, kako radi, glasovi, uskoro | „Prijava” → `/admin/login` | „Zatraži pristup” → `[KONTAKT — S6]` | LogoMedo · slike i radni listići za logopede | Katalog slika po glasovima i pozicijama, radni listići za ispis i igre za dijete na tabletu. LogoMedo je alat za logopede. | da |
| `/katalog` | Glasovi, pozicije, dva stila, pregled slika, znakovi | „Prijava” | „Zatraži pristup” | Katalog slika po glasovima · LogoMedo | 30 glasova, 650+ riječi i 1300+ slika u dva stila: ilustracija i bojanka. Riječi složene po početku, sredini i kraju. | da |
| `/radni-listici` | Vrste zadataka, predlošci, PDF i ispis, okviri | „Prijava” | „Zatraži pristup” | Radni listići i PDF za ispis · LogoMedo | Radni listić po glasovima u jednom kliku i još deset vrsta zadataka. Gotov PDF za A4, s ukrasnim okvirom ili bez. | da |
| `/igre` | Igra za dijete preko linka, teme, privatnost, demo | „Isprobaj igru” → `[DEMO — S6]` (samo ako S6 odobri demo); inače „Prijava” | „Zatraži pristup” | Igre za dijete na tabletu · LogoMedo | Zadatke iz bilježnice dijete rješava na tabletu ili mobitelu preko linka, bez prijave. O djetetu se ništa ne sprema. | da |
| `/o-nama` | Tko stoji iza, stari i novi LogoMedo, alfa | „Zatraži pristup” | „Prijava” | O nama · LogoMedo | Novi LogoMedo nastaje zajedno s logopedima. Tko ga radi, odakle dolazi i kako se uključiti u probno razdoblje. | da |
| `/privatnost` | Što landing, aplikacija i igra (ne) spremaju | — | „Zatraži pristup” (pitanja o privatnosti) | Privatnost · LogoMedo | Stranice LogoMeda ne koriste kolačiće ni praćenje. Što se sprema za logopede i zašto se o djetetu ne sprema ništa. | da |
| 404 (`src/pages/404.astro`) | Izgubljena stranica | „Na naslovnu” → `/` | „Katalog” → `/katalog` | Stranica nije pronađena · LogoMedo | (bez; `noindex`) | ne |

Duljine (`<title>` ≤ 60, description ≤ 155) provjerene su brojanjem znakova pri pisanju; S3 ih provjerava
skriptom.

### 2.2 Zaglavlje

Redoslijed slijeva nadesno:

1. Logo (komponenta `Marka`) → `/` (tekst za čitač zaslona: „LogoMedo, naslovna”)
2. „Katalog” → `/katalog`
3. „Radni listići” → `/radni-listici`
4. „Igre” → `/igre`
5. „O nama” → `/o-nama`
6. Gumb **„Prijava”** → `/admin/login` (istaknut, desno)

Trenutna stranica ima `aria-current="page"`. „Privatnost” nije u zaglavlju, samo u podnožju.

### 2.3 Mobilna navigacija

Ispod 720 px: logo lijevo, gumb „Prijava” i „Izbornik” desno. „Izbornik” je `<details><summary>` (radi bez
skripte, CSP [LO-13]); otvoren pokazuje istih pet linkova jedan ispod drugog, dodirne površine najmanje 44 px.

### 2.4 Podnožje

- Stupac 1: logo, rečenica „Slike, radni listići i igre za logopedsku terapiju.”
- Stupac 2 „LogoMedo”: Katalog · Radni listići · Igre · O nama
- Stupac 3 „Pomoć”: Prijava (`/admin/login`) · Zatraži pristup (`[KONTAKT — S6]`) · Privatnost (`/privatnost`)
- Donji red: „© 2026. `[IME TVRTKE — S6]`” · „Kontakt: `[KONTAKT — S6]`”

Ako S6 ne odluči ime tvrtke ili kontakt, taj element se izostavlja (ne ostaje placeholder) [OP-1], [OP-2].

### 2.5 OG slika

Prijedlog: jedna zajednička `public/landing/og.png`, **1200 × 630, PNG** (WebP neki pregledi linkova ne
prikazuju), svijetla pozadina, lijevo naslov „Slike za svaki glas. Listić za tren.”, desno četiri ilustracije
RIBA, SUNCE, ŽABA, LAV [V-27]. Svaka stranica ima `og:title` = `<title>`, `og:description` = meta description,
`og:locale` = `hr_HR`.

---

## 3. Stranice

### 3.1 Naslovna `/`

#### N-1 Hero

- **h1:** Slike za svaki glas. *Listić za tren.*
- **Tekst:** LogoMedo je radni alat za logopede: katalog slika po glasovima i pozicijama, radni listići koje
  ispišete u jednom kliku i igre koje dijete rješava na tabletu. [I-KAT-1], [I-KAT-2], [I-ZAD-1], [I-PDF-1], [I-BIL-2]
- **Mala oznaka iznad h1:** Probno razdoblje · samo uz pozivnicu [I-RBAC-2], [PO-3]
- **CTA:** „Prijava” → `/admin/login` · „Zatraži pristup” → `[KONTAKT — S6]` [LO-14], [PO-4]
- **Pod CTA, sitno:** Za prijavu vam treba pozivnica. Nemate je? Zatražite pristup. [I-RBAC-2]
- **Vizual:** [V-1]

#### N-2 Što je LogoMedo (tri stupa)

- **h2:** Sve za vježbu glasova na jednom mjestu
- **Stupac 1, h3: Katalog slika** — 30 glasova, 650+ riječi i 1300+ slika, složenih po tome je li glas na početku,
  u sredini ili na kraju riječi. Svaka slika u dva stila: u boji i za bojanje. [I-KAT-1], [I-KAT-2], [I-KAT-4],
  [B: Glasova u katalogu], [B: Aktivnih riječi], [B: Odobrenih slika] · link „Pogledajte katalog” → `/katalog` · [V-2]
- **Stupac 2, h3: Radni listići** — Odaberite glas i poziciju, a listić se složi sam. Uz njega još deset vrsta
  zadataka, od uparivanja do kola slova, i gotov PDF za ispis. [I-ZAD-1], [I-ZAD-2], [I-PDF-1], [B: Vrsta zadataka]
  · link „Vrste zadataka” → `/radni-listici` · [V-3]
- **Stupac 3, h3: Igre za dijete** — Zadatke složite u bilježnicu i djetetu pošaljite link. Rješava ih na
  tabletu ili mobitelu, bez prijave. [I-BIL-1], [I-BIL-2] · link „Kako izgleda igra” → `/igre` · [V-4]

#### N-3 Kako radi

- **h2:** Od glasa do listića u tri koraka
- **Koraci (numerirana lista):**
  1. **Odaberite glas.** Npr. R na početku riječi, ili bez glasa L. [I-KAT-2], [I-ZAD-2]
  2. **Složite zadatak.** Predložak u jednom kliku složi listić iz kataloga, a vi ga po želji uredite. [I-ZAD-1], [I-ZAD-13]
  3. **Ispišite ili pošaljite.** Preuzmite PDF za A4 ili zadatke složite u bilježnicu i djetetu pošaljite link
     na igru. [I-PDF-1], [I-BIL-1], [I-BIL-2]
- **Vizual:** bez zasebnog; koraci su tekst (na desktopu uz [V-13] desno)

#### N-4 Glasovi

- **h2:** 30 glasova, svaki na početku, u sredini i na kraju
- **Tekst:** Katalog ima 25 suglasnika i 5 samoglasnika. LJ, NJ i DŽ su jedan glas, kao u govoru. Za R postoje i
  skupine (KR-, BR-) i slogotvorno R. [I-KAT-1], [I-KAT-2], [I-KAT-3], [B: Glasova u katalogu]
- **Pločice (tekst, ne slika; redoslijed iz kataloga [B: Redoslijed glasova]):**
  C S Z Č Š Ž L R K Đ DŽ G M B P V F T D N J LJ NJ Ć H · A E I O U
  (samoglasnici kao zasebna skupina iza razmaka; pločice nisu linkovi jer je katalog iza prijave [I-KAT-1])
- **Ispod:** Riječi možete složiti i po mjestu tvorbe, načinu tvorbe ili zvučnosti. [I-KAT-1]
- **Vizual:** pločice; uz četiri pločice (R, S, Ž, L) male ilustracije RIBA, SUNCE, ŽABA, LAV [V-1] (ponovno,
  256 px)

#### N-5 Uskoro

- **h2:** Uskoro
- **Lista:**
  - **Aplikacija za tablet i mobitel.** [I-APP-1], [I-APP-2], [I-APP-3], [PO-2]
  - **Slušne vježbe u igri:** „Koje slovo čuješ?” i „Gdje je glas?”. Na papiru već rade. [I-ZAD-11], [I-ZAD-12], [I-ZVK-3]
  - **Izgovor u igri za više riječi.** Danas igra naglas čita upute i odabrane riječi. [I-ZVK-1], [I-ZVK-2], [PO-2]
- Napomena za S3: praćenje napretka djeteta [I-ZAD-16] se **ne** spominje (nije ni u izradi na UI-ju, a uz
  „ne spremamo ništa o djetetu” zbunjuje).

#### N-6 Završni poziv

- **h2:** LogoMedo je u probnom razdoblju
- **Tekst:** Gradimo ga zajedno s logopedima i pristup je zasad samo uz pozivnicu. Ako želite isprobati katalog,
  listiće i igre u svom radu, javite nam se. [I-RBAC-1], [I-RBAC-2], [PO-3]
- **CTA:** „Zatraži pristup” → `[KONTAKT — S6]` · „Prijava” → `/admin/login`

---

### 3.2 `/katalog`

#### K-1 Hero

- **h1:** Katalog slika po glasovima
- **Tekst:** 30 glasova, 650+ riječi i 1300+ slika. Za svaku riječ znate gdje je glas: na početku, u sredini ili
  na kraju. [I-KAT-1], [I-KAT-2], [B: Glasova u katalogu], [B: Aktivnih riječi], [B: Odobrenih slika]
- **CTA:** „Prijava” · „Zatraži pristup”
- **Vizual:** [V-6]

#### K-2 Glasovi i pozicije

- **h2:** Glas, pa pozicija
- **Tekst:** Otvorite mapu glasa i riječi su već razvrstane: početak, sredina, kraj. Za R su odvojene i skupine
  (KR-, BR-) i slogotvorno R. Mape možete složiti po mjestu tvorbe, načinu tvorbe ili zvučnosti. [I-KAT-1], [I-KAT-2]
- **Tekst 2:** Glasovi i pozicije čitaju se iz same riječi, a logoped ih potvrđuje. LJ, NJ i DŽ su uvijek jedan
  glas. [I-KAT-3]
- **Lista:**
  - Tražilica bez kvačica: „cokolada” nađe „čokolada”. [I-KAT-6]
  - Stranica riječi: sve slike, pozicije glasova i rečenica s tom riječi. [I-KAT-5]
  - Popis nepoželjnih riječi: riječi koje ne želimo u katalogu, s razlogom. [I-KAT-12]
- **Vizual:** [V-7]

#### K-3 Dva stila

- **h2:** U boji ili za bojanje
- **Tekst:** Svaka riječ ima dva stila slike. **Ilustracija** je akvarel u boji, za igru i razgovor.
  **Bojanka** je crno-bijeli crtež koji dijete oboji. Stil birate jednim prekidačem, u katalogu i za svaki
  zadatak. [I-KAT-4], [I-ZAD-13], [B: Stilova]
- **Vizual:** [V-8] i [V-9] (par ilustracija/bojanka jedan uz drugi)

#### K-4 Slike koje je netko pogledao

- **h2:** Svaku sliku pregleda logoped
- **Tekst:** U katalog ulazi samo odobrena slika. Recenzent je pregleda i odobri, ili je odbije i napiše što ne
  valja i kako treba. Odbijena slika odmah nestaje iz kataloga, listića i igre. [I-KAT-9], [I-KAT-10], [I-RBAC-5], [PO-1]
- **Tekst 2:** Nedostaje vam slika? Učitajte svoju ili zatražite novu, u okviru tjednog limita. I nova slika
  prije objave prolazi pregled. [I-KAT-8], [I-KAT-7], [I-RBAC-4], [I-RBAC-5]
- **Vizual:** [V-10]

#### K-5 Slova i znakovi

- **h2:** Slova, brojke i znakovi
- **Tekst:** Uz slike, katalog ima 90 znakova: velika i mala slova, brojke i simbole. Pisani su fontom Andika,
  koji je napravljen za početno čitanje, pa se b, d i p jasno razlikuju. Koristite ih u zadacima za slična slova
  i za par slovo–slika. [I-KAT-14], [B: Znakova]
- **Vizual:** [V-11]

#### K-6 Scene

- **h2:** Scene za priču
- **Tekst:** Ilustracije svakodnevnih situacija, npr. „Pečemo kolačiće”, uspravno i vodoravno. Dijete na sceni
  traži sve što pripada. [I-KAT-13], [I-ZAD-7]
- **Vizual:** [V-12]

#### K-7 Poziv

- **h2:** Pogledajte katalog iznutra
- **Tekst:** Katalog je dostupan logopedima s pozivnicom. [I-RBAC-1], [I-RBAC-2]
- **CTA:** „Zatraži pristup” · „Prijava” · link „Kako od slika nastaje listić” → `/radni-listici`

---

### 3.3 `/radni-listici`

#### R-1 Hero

- **h1:** Radni listić u jednom kliku
- **Tekst:** Odaberite glas i poziciju, a LogoMedo složi listić sa slikama iz kataloga. Uredite ga, preuzmite PDF
  i ispišite. [I-ZAD-1], [I-ZAD-2], [I-PDF-1]
- **CTA:** „Prijava” · „Zatraži pristup”
- **Vizual:** [V-14]

#### R-2 Radni listić po glasovima

- **h2:** Listić po glasovima
- **Lista:**
  - Odaberite jedan ili više glasova i poziciju: početak, sredina, kraj. [I-ZAD-2]
  - Isključite glasove koje dijete još ne izgovara, npr. „bez L”. [I-ZAD-2]
  - „Uz samoglasnike”: samo riječi u kojima je glas uz samoglasnik (SOK, ne STOL). [I-ZAD-2]
  - Naslov se napiše sam, a slike složite u mrežu stupaca i redova, do 150 slika na više stranica. [I-ZAD-2], [I-PDF-2]
- **Vizual:** [V-13]

#### R-3 Vrste zadataka

- **h2:** 11 vrsta zadataka
- **Uvod:** Svaku vrstu složi predložak iz kataloga, a vi je uredite. Prije ispisa vidite zadatak točno kako ga
  vidi dijete. [I-ZAD-1], [I-ZAD-13], [I-ZAD-14], [B: Vrsta zadataka]
- **Kartice (h3 + tekst):**
  1. **Radni listić** — Naslov i niz slika s riječi ispod, po glasu i poziciji. [I-ZAD-2]
  2. **Prebrajanje** — Ispod slike su kružići; dijete oboji onoliko koliko riječ ima slogova ili glasova. Ili
     dugačke i kratke riječi zaokruži dvjema bojama. [I-ZAD-3]
  3. **Uparivanje** — Zadana je jedna slika, ispod su tri. Dijete bira onu koja se rimuje, počinje istim glasom ili
     slogom ili završava istim glasom. [I-ZAD-4]
  4. **Povezivanje** — Dva stupca slika; dijete povezuje parove po rimi, prvom glasu, slogu ili zadnjem glasu, ili
     slovo sa slikom. [I-ZAD-5]
  5. **Izbaci uljeza** — Četiri slike u redu: tri idu zajedno, jedna ne. [I-ZAD-6]
  6. **Scena** — Ilustracija situacije; dijete bira sve slike koje joj pripadaju. [I-ZAD-7]
  7. **Vizualna percepcija** — Nađi onu koja je drukčija ili dvije iste: zrcaljeno, naopako, okrenuto, manje. Radi
     i sa slovima. [I-ZAD-8]
  8. **Prvi glas (kolo slova)** — Dijete zavrti kolo sa slovima i među 12–15 slika nađe sve koje počinju tim
     glasom. [I-ZAD-9]
  9. **Razvrstavanje** — 4 do 12 slika u dvije do četiri vreće, košare ili kutije: po prvom ili zadnjem glasu,
     broju slogova ili broju glasova. [I-ZAD-10]
  10. **Koje slovo čuješ?** — Logoped izgovori glas, a dijete na listiću pronađe slovo koje je čulo. *U igri
      uskoro.* [I-ZAD-11], [PO-2]
  11. **Gdje je glas?** — Ispod slike tri kruga: dijete označi je li glas na početku, u sredini ili na kraju.
      *U igri uskoro.* [I-ZAD-12], [PO-2]
- **Vizual:** [V-15] (mreža predložaka), [V-16], [V-17]

#### R-4 PDF i ispis

- **h2:** Gotov PDF za A4
- **Tekst:** „Preuzmi PDF” složi stranicu A4 točno kako je vidite na ekranu. PDF nastaje u vašem pregledniku, pa
  se ništa ne šalje dalje. Duži listić se sam prelije na drugu stranicu. [I-PDF-1], [I-PDF-2]
- **Tekst 2:** Na vrhu stranice je prazna crta za ime djeteta, koju upišete rukom. [I-PDF-2] (inventura „Stranice
  za snimke”, `/admin/zadaci/<id>` Ispis: „crta Ime: ____ je prazna”)
- **Vizual:** [V-14]

#### R-5 Okviri

- **h2:** Ukrasni okviri
- **Tekst:** Listiću dodajte okvir: rub s kockicama ili prugama, mašnu na vrhu i ukrase u kutovima, poput
  medvjedića ili snjegovića. Možete odabrati i jedan od gotovih okvira. Boje su svijetle, a uzorak počinje 5 mm
  od ruba papira, pa okvir ne troši puno tinte i kućni ga pisač ispiše cijelog. [I-OKV-1]
- **Sitno:** Okviri su za papir; u igri ih nema. Zasad su ukrasi zimski. [I-OKV-1]
- **Vizual:** [V-18]

#### R-6 Bilježnica

- **h2:** Više zadataka u jednoj bilježnici
- **Tekst:** Zadatke složite u bilježnicu s temom. Ispišite je cijelu, s naslovnicom na kojoj dijete za svaki
  riješen red oboji lampicu na boru, ili djetetu pošaljite link na igru. [I-BIL-1], [I-PDF-3], [I-BIL-2]
- **CTA:** link „Kako izgleda igra” → `/igre`
- **Vizual:** [V-23]

#### R-7 Poziv

- **h2:** Složite prvi listić
- **CTA:** „Zatraži pristup” · „Prijava”

---

### 3.4 `/igre`

#### G-1 Hero

- **h1:** Igra za dijete, na tabletu
- **Tekst:** Zadatke iz bilježnice dijete rješava na tabletu ili mobitelu. Pošaljete mu link i to je sve: bez
  prijave, bez instalacije. [I-BIL-1], [I-BIL-2]
- **CTA:** ako S6 odobri demo: „Isprobaj igru” → `[DEMO — S6]`; inače „Prijava” · uvijek „Zatraži pristup”
- **Vizual:** [V-20]

#### G-2 Kako dijete igra

- **h2:** Kreni, riješi, Bravo!
- **Numerirana lista:**
  1. Dijete dodirne „Kreni”. [I-BIL-2]
  2. Rješava zadatak po zadatak. Točan odgovor zasvijetli zeleno uz zvonce. [I-BIL-2]
  3. Za svaki riješen zadatak upali se lampica na boru ili pocrveni jabuka na stablu. [I-BIL-2], [I-BIL-3]
  4. Na kraju ga čeka „Bravo!”, a „Ponovi” kreće ispočetka. [I-BIL-2]
- **Tekst:** U igri su sve vrste zadataka osim radnog listića, koji je za papir. Razvrstavanje dijete radi
  povlačenjem slike prstom, a kolo slova zavrti dodirom. [I-BIL-2] (inventura ispod I-BIL: „sve osim listića”),
  [I-ZAD-9], [I-ZAD-10]
- **Sitno:** „Koje slovo čuješ?” i „Gdje je glas?” u igri stižu uskoro. [I-ZAD-11], [I-ZAD-12]
- **Vizual:** [V-21], [V-22]

#### G-3 Teme

- **h2:** Dvije teme
- **Kartice:**
  - **Božić** — Zimsko selo u sumrak, snijeg i bor. Svaki riješen zadatak pali lampicu. [I-BIL-3]
  - **Proljeće** — Sunčana livada i stablo jabuke. Svaki riješen zadatak pocrveni jednu jabuku. [I-BIL-3]
- **Tekst:** Igra radi uspravno i vodoravno, na tabletu i na mobitelu. [I-BIL-3], [I-BIL-2]
- **Vizual:** [V-20] (Božić), [V-21] (Proljeće)

#### G-4 Izgovor

- **h2:** Igra čita naglas
- **Tekst:** Upute i odabrane riječi igra izgovara hrvatskim glasom. Svaki izgovor prije objave posluša i odobri
  čovjek. Gdje izgovora još nema, nema ni zvučnika, pa dijete uputu čuje od vas. [I-ZVK-1], [I-ZVK-2], [PO-2]
- Napomena za S5: ne pisati „svaka riječ se izgovara” (74 odobrena teksta [B: Odobrenih izgovora]).

#### G-5 Privatnost djeteta

- **h2:** O djetetu ne spremamo ništa
- **Tekst:** Igra ne traži ime, prijavu ni račun. Dok dijete rješava, ništa se o njemu ne sprema i ne šalje.
  Stranica igre nije u tražilicama, a link zna samo onaj kome ga pošaljete. [I-BIL-4], [I-ZAD-16], inventura
  „Što danas vidi javnost” (`/b/<slug>`: noindex, nema popisa)
- **Link:** „Više o privatnosti” → `/privatnost`

#### G-6 Isprobaj igru (UVJETNA: samo ako S6 odobri demo) [OP-4]

- **h2:** Isprobajte sami
- **Tekst:** Otvorite probnu bilježnicu s nekoliko zadataka i riješite je kao dijete. Najbolje na tabletu.
  [I-BIL-2], [PO-5]
- **CTA:** „Isprobaj igru” → `[DEMO — S6]` (otvara se u istoj kartici; obični link, bez skripte [LO-13])
- **Sitno:** Ovo je primjer; ništa što napravite u igri se ne sprema. [I-BIL-4]

#### G-6R Rezerva bez demoa (ako S6 ne odobri demo)

- **h2:** Ovako izgleda na tabletu
- **Tekst:** Igru dobiva dijete preko linka od svog logopeda. Ako ste logoped i želite je isprobati sa svojim
  zadacima, zatražite pristup. [I-BIL-1], [I-BIL-2], [I-RBAC-2]
- **Vizual:** galerija [V-20], [V-21], [V-22] (tri snimke jedna uz drugu, na mobitelu jedna ispod druge)
- **CTA:** „Zatraži pristup” · „Prijava”

#### G-7 Za logopeda

- **h2:** Vi slažete, dijete igra
- **Tekst:** Bilježnicu složite od svojih zadataka i odredite im redoslijed. LogoMedo vam kaže ako neki zadatak
  još nije spreman za igru. Prije slanja svaki zadatak možete i sami odigrati, točno kako ga vidi dijete.
  [I-BIL-1], [I-ZAD-14]
- **Vizual:** [V-24]

---

### 3.5 `/o-nama`

#### O-1 Hero

- **h1:** Novi LogoMedo nastaje s logopedima
- **Tekst:** LogoMedo radi mali tim koji ga gradi zajedno s logopedima iz prakse. Svaka nova vrsta zadatka i
  svaka slika prolazi kroz ruke nekoga tko radi s djecom. [I-KAT-9], [I-RBAC-5] — *ime, priča i fotografija:
  [OP-5]; ako S6 da ime i priču, zamjenjuju prvu rečenicu.*
- **Vizual:** [V-25]

#### O-2 Stari i novi LogoMedo

- **h2:** Od bojanki do igre
- **Tekst:** Prvi LogoMedo `[GODINA — S6]` bio je zbirka bojanki po glasovima od kojih logoped složi radni listić
  i ispiše ga. Novi LogoMedo preuzeo je stari katalog, s istim razvrstavanjem po početku, sredini i kraju riječi,
  i nadogradio ga: više od dvjesto novih riječi, slike u boji, deset novih vrsta zadataka i igru za dijete.
  [B: Aktivnih riječi] (425 iz starog kataloga, 234 dodane), [I-KAT-2] (pravilo se poklapa s 629 od 632 starih
  putanja), [I-KAT-4], [I-ZAD-1], [I-BIL-2]
- Napomena: opis starog appa (bojanke, listić, PDF) i godina 2017. nisu u inventuri nego u privatnom
  `../preuzimanje/docs/legacy-app.md`; zato su godina i dio „zbirka bojanki” [OP-5]. Ako S6 ne potvrdi, ostaje
  samo: „Novi LogoMedo preuzeo je stari katalog …”.

#### O-3 Probno razdoblje

- **h2:** Probno razdoblje
- **Tekst:** LogoMedo je u probnom razdoblju (alfi). Logopedi ulaze uz osobnu pozivnicu i prijavljuju se bez
  lozinke: otiskom prsta, licem ili PIN-om uređaja. Svaki logoped vidi zajednički katalog, a svoje zadatke i
  bilježnice samo on. [I-RBAC-1], [I-RBAC-2], [I-PRI-1]
- **Tekst 2:** Što nam logopedi kažu, ide ravno u sljedeću verziju. Ako želite sudjelovati, javite se.
  [I-RBAC-2], [PO-4] — *bez cijene i bez „besplatno” [PO-3], [OP-3]*
- **CTA:** „Zatraži pristup” → `[KONTAKT — S6]`

#### O-4 Kontakt

- **h2:** Kontakt
- **Tekst:** `[IME TVRTKE — S6]` · `[KONTAKT — S6]` [OP-1], [OP-2]. Ako S6 ne odluči, sekcija se izostavlja.

---

### 3.6 `/privatnost`

Ovo nije pravni dokument ni obećanje; opisuje kako stranice i aplikacija rade danas. Pravni dio (voditelj
obrade, kontakt za zaštitu podataka) je [OP-6]; dok nije odgovoreno, odjeljak P-5 se ne objavljuje.

#### P-1 Uvod

- **h1:** Privatnost
- **Tekst:** Ukratko: ove stranice ne prikupljaju ništa, a o djetetu koje igra ne spremamo ništa. Ispod je
  točno što se gdje sprema. [LO-12], [I-BIL-4]
- **Sitno:** Stanje na dan `[DATUM OBJAVE — S6]`.

#### P-2 Ove stranice

- **h2:** Stranice logomedo.com
- **Lista:**
  - Bez kolačića, analitike i praćenja. [LO-12]
  - Bez vanjskih skripti i fontova: sve se učitava s logomedo.com. [LO-12]
  - Nema obrasca koji bi skupljao podatke. [LO-12], [LO-13] (landing nema skripti)

#### P-3 Igra za dijete

- **h2:** Igra za dijete
- **Lista:**
  - Igra ne traži ime, prijavu ni račun. [I-BIL-2]
  - Ništa o djetetu i njegovim odgovorima ne sprema se i ne šalje. [I-BIL-4], [I-ZAD-16], [PO-3]
  - Stranica igre nije u tražilicama i ne postoji popis bilježnica; do nje se dolazi samo linkom.
    [I-BIL-4], inventura „Što danas vidi javnost”
- **Savjet logopedu:** U naslov bilježnice ili zadatka ne upisujte puno ime djeteta: naslov vidi svatko tko ima
  link. (inventura „Stranice za snimke”: naslovi mogu sadržavati ime djeteta; naslov se prikazuje na `/b/<slug>`)

#### P-4 Logopedi s računom

- **h2:** Što spremamo za logopede
- **Lista:**
  - **Račun:** e-mail na koji je stigla pozivnica, ime i prezime ako ih upišete, i uloga. [I-RBAC-2], [I-ADM-1], [I-RBAC-1]
  - **Prijava:** passkey (otisak prsta, lice ili PIN uređaja), bez lozinke. [I-PRI-1]
  - **Sesija:** prijava traje najviše 12 sati, a nakon 2 sata neaktivnosti se zatvara. [I-PRI-3]
  - **Vaš rad:** zadaci, bilježnice i slike koje učitate ili zatražite, s poviješću izmjena. [I-ZAD-13], [I-BIL-1], [I-KAT-8], [I-AKT-1]
  - **Limit:** koliko ste novih slika i izgovora zatražili u zadnjih 7 dana. [I-RBAC-4]
  - Vaše zadatke i bilježnice drugi logopedi ne vide. [I-RBAC-1]
  - PDF zadatka nastaje u vašem pregledniku i ne šalje se dalje. [I-PDF-1]
- **Što ne spremamo:** podatke o djeci; LogoMedo nema popis djece ni njihovih rezultata. [I-ZAD-16], [PO-3]

#### P-5 Tko odgovara za podatke (UVJETNO, [OP-6])

- **h2:** Tko odgovara za podatke
- **Tekst:** Voditelj obrade je `[IME TVRTKE — S6]`. Za pitanja o vašim podacima pišite na `[KONTAKT — S6]`.

---

### 3.7 404

- **h1:** Ova se stranica sakrila
- **Tekst:** Stranicu koju tražite nismo našli. Možda je link zastario ili je u adresi mala pogreška.
- **Ako je adresa počinjala s /b/** (S5 odlučuje može li prerenderirana 404 to znati; ako ne, rečenica ide za sve):
  Ako ste dobili link na igru, provjerite ga s logopedom koji vam ga je poslao. (inventura: `/b/ne-postoji-xyz` 404)
- **CTA:** „Na naslovnu” → `/` · „Katalog” → `/katalog`
- **Vizual:** [V-26]
- `noindex`, nije u sitemapu.

---

## 4. Popis vizuala

Snimke: staging (`staging.logomedo.com`, sesija `scripts/staging-sesija.sh` **kao logoped**, bez
`--superadmin`, osim gdje piše drukčije), veličine **desktop 1280 × 800** i **mobitel 390 × 844**, spremaju se
kao `.webp` u `public/landing/` [LO-15]. Ilustracije: preuzete jednom s `https://cdn.logomedo.com/<ključ>`,
smanjene u `.webp` (512 px, i 256 px gdje piše) u `public/landing/` [PO-6]. Ključevi iz inventure („Ilustracije
za landing”). Prije objave pozicije glasova uz ilustracije potvrditi na stranici riječi (inventura).

**Sakriti na svakoj admin snimci:** `.tko` (cijeli blok računa u bočnoj traci: `title` s e-mailom, `.avatar`,
`.email`, `.uloga`) — sakriti CSS-om prije snimke ili izrezati bočnu traku.

| ID | Stranica / sekcija | Vrsta | Izvor | Veličine | Tema | Što se sakriva | Napomena | Alt |
|---|---|---|---|---|---|---|---|---|
| V-1 | `/` N-1 (i N-4 manje) | ilustracija ×4 | `ilustracija/riba/08b78c1b64f7ace1.png`, `ilustracija/sunce/7b78ac6aeb220458.png`, `ilustracija/zhaba/5bd3da7ad6c5afb4.png`, `ilustracija/lav/64116adb7fe6882d.png` | 512 i 256 px | obje (prozirni rub ili zaobljena kartica) | — | dekorativno u N-4 (`alt=""`), sadržajno u N-1 | „Ilustracije iz kataloga: riba, sunce, žaba i lav.” |
| V-2 | `/` N-2 stup 1 | snimka | `/admin?stil=ilustracija` | 1280×800, 390×844 | svijetla | `.tko` | mape 30 glasova s brojevima | „Katalog u LogoMedu: mape glasova s brojem riječi u svakoj.” |
| V-3 | `/` N-2 stup 2 | snimka | `/admin/zadaci/<id>` kartica Ispis (listić po glasu R, ilustracije) | 1280×800, 390×844 | svijetla | `.tko`, naslov zadatka ako sadrži ime | napraviti probni listić neutralnog naslova na stagingu (npr. „Glas R na početku”) | „Radni listić za glas R na početku riječi, spreman za ispis na A4.” |
| V-4 | `/` N-2 stup 3 | snimka | `/b/<demo-staging>` vodoravno, tema Božić | 1280×800 | svijetla (igra ima svoju pozadinu) | slug u adresnoj traci (snimati bez trake), naslov bilježnice neutralan | treba demo bilježnica na stagingu [OP-4] | „Igra za dijete na tabletu: zadatak sa slikama i bor s lampicama.” |
| V-6 | `/katalog` K-1 | snimka | `/admin?stil=ilustracija` | 1280×800, 390×844 | obje | `.tko` | može biti ista datoteka kao V-2 (mobilna varijanta za mobitel) | „Katalog s 30 mapa glasova, u stilu ilustracije.” |
| V-7 | `/katalog` K-2 | snimka | `/admin/glas/r?stil=ilustracija` | 1280×800, 390×844 | svijetla | `.tko` | pozicije početak/sredina/kraj i skupine vidljive bez pomicanja | „Riječi s glasom R razvrstane po poziciji: početak, sredina, kraj i skupine.” |
| V-8 | `/katalog` K-3 | ilustracija ×2 | `ilustracija/riba/08b78c1b64f7ace1.png` + `bojanka/riba/92c77de0ca525f8a.png` | 512 px | obje (bojanka na bijeloj kartici i u tamnoj temi) | — | par jedan uz drugi | „Riba u dva stila: ilustracija u boji i crno-bijela bojanka.” |
| V-9 | `/katalog` K-3 | ilustracija ×2 | `ilustracija/sunce/7b78ac6aeb220458.png` + `bojanka/sunce/98eabebff5090197.png` | 512 px | obje | — | rezerva: `zhaba`, `lav` parovi iz inventure | „Sunce u dva stila: ilustracija u boji i bojanka.” |
| V-10 | `/katalog` K-4 | snimka | `/admin/pregled` | 1280×800 | svijetla | `.tko`; ako se snima kao superadmin: `form.filtar-korisnika`, `#korisnik`, `#poslao`, poruka „X je već odobrio” | kao logoped vidi samo svoje slike: možda treba superadmin sesija uz sakrivanje | „Pregled nove slike s gumbima Odobri i Odbij.” |
| V-11 | `/katalog` K-5 | snimka | `/admin/znakovi` | 1280×800, 390×844 | svijetla | `.tko` | prikaz b/d/p u Andiki | „Slova, brojke i simboli u fontu za početno čitanje.” |
| V-12 | `/katalog` K-6 | snimka | `/admin/situacije` (ili scena u `/admin/zadaci/<id>/dijete`) | 1280×800 | svijetla | `.tko` | odabrati „Pečemo kolačiće” | „Ilustracija scene Pečemo kolačiće sa slikama ispod.” |
| V-13 | `/radni-listici` R-2, `/` N-3 | snimka | `/admin/predlosci`, otvoren dijalog „Po glasovima…” | 1280×800, 390×844 | svijetla | `.tko` | logopedski mod uključen (zadano) | „Odabir glasa, pozicije i isključenih glasova za novi radni listić.” |
| V-14 | `/radni-listici` R-1, R-4 | snimka | `/admin/zadaci/<id>` kartica Ispis, listić s okvirom | 1280×800, 390×844 | svijetla | `.tko`, naslov zadatka | isti probni listić kao V-3, s okvirom; crta „Ime:” prazna | „Radni listić na stranici A4 s ukrasnim okvirom i praznom crtom za ime.” |
| V-15 | `/radni-listici` R-3 | snimka | `/admin/predlosci` (11 kartica vrsta) | 1280×800, 390×844 | obje | `.tko` | | „Jedanaest vrsta zadataka u predlošcima.” |
| V-16 | `/radni-listici` R-3 | snimka | `/admin/zadaci/<id>/dijete`, vrsta Prvi glas (kolo slova) | 1280×800 | svijetla | naslov zadatka | probni zadatak na stagingu | „Kolo sa slovima stalo je na glasu; zatim dijete među slikama traži one koje počinju tim glasom.” |
| V-17 | `/radni-listici` R-3 | snimka | `/admin/zadaci/<id>` Ispis, vrsta Prebrajanje | 1280×800 | svijetla | `.tko`, naslov | probni zadatak na stagingu | „Zadatak prebrajanja: ispod svake slike kružići za slogove.” |
| V-18 | `/radni-listici` R-5 | snimka | `/admin/zadaci/<id>` kartica Okvir | 1280×800 | svijetla | `.tko`, naslov | | „Izbor okvira: rubovi, mašne i ukrasi za kutove.” |
| V-20 | `/igre` G-1, G-3 | snimka | `/b/<demo-staging>` vodoravno, **Božić** | 1280×800 | — | slug (bez adresne trake), naslov neutralan | demo bilježnica na stagingu [OP-4] | „Igra u temi Božić: zadatak na tabletu i bor s lampicama.” |
| V-21 | `/igre` G-2, G-3 | snimka | `/b/<demo-staging>` uspravno, **Proljeće** | 390×844 | — | slug, naslov | bilježnica s temom Proljeće na stagingu (na produkciji je nijedna nema) | „Igra u temi Proljeće na mobitelu: stablo jabuke i zadatak sa slikama.” |
| V-22 | `/igre` G-2 | snimka | `/b/<demo-staging>`, završni ekran „Bravo!” | 1280×800, 390×844 | — | slug, naslov | | „Završni ekran igre s porukom Bravo i gumbom Ponovi.” |
| V-23 | `/radni-listici` R-6 | snimka | `/b/<demo-staging>/ispis`, naslovnica | 1280×800 (A4 izrez) | svijetla | naslov bilježnice; `.ime` prazna | | „Naslovnica bilježnice s borom čije lampice dijete boji.” |
| V-24 | `/igre` G-7 | snimka | `/admin/biljeznice/<id-demo>` | 1280×800 | svijetla | `.tko`, **stupac/polje „Poveznica” (`#slug`)**, stupac „Autor” (ako SA) | | „Bilježnica sa zadacima složenima po redu.” |
| V-25 | `/o-nama` O-1 | ilustracija | `ilustracija/sova/25415d78d2f71e60.png` | 512 px | obje | — | zamjenjuje se fotografijom ako [OP-5] | „Ilustracija sove iz kataloga.” |
| V-26 | 404 | ilustracija | `ilustracija/mish/c033416244ccab9b.png` | 256 px | obje | — | | „Mali miš, ilustracija iz kataloga.” |
| V-27 | OG slika (sve stranice) | kompozicija | V-1 (četiri ilustracije) + naslov | 1200×630 PNG | svijetla | — | S3 složi jednom; nije webp (pregledi linkova) | (OG nema alt; `og:image:alt` = „LogoMedo: slike za svaki glas, listić za tren.”) |

Napomene:
- V-5 i V-19 namjerno ne postoje (N-4 su tekstualne pločice; R-6 koristi V-23).
- Za V-3, V-4, V-14, V-16, V-17, V-20–V-24 na stagingu treba napraviti probne zadatke i **demo bilježnicu**
  neutralnog naslova (bez imena djeteta), jednu u temi Božić i jednu u temi Proljeće. Staging smije (zadana odluka).
- Na stagingu nema ElevenLabs secreta [LO-9]; izgovor se na snimkama ne vidi pa to nije problem.
- Prije commita svaku snimku pregledati na e-mail, ime, slug (inventura „Stranice za snimke”, [LO-14], [LO-15]).
  **Ne snimati:** `/admin/korisnici`, `/admin/aktivnost`, `/admin/postavke`, `/admin/passkeys`, `/admin/poziv`,
  `/admin/red`, `/admin/prompt`.

---

## 5. Otvorena pitanja za vrata S6

1. **Kontakt i „Zatraži pristup”** (`[KONTAKT — S6]`). Opcije: (a) `mailto:` na opću adresu domene (npr.
   info@ ili alfa@ — korisnik bira i postavlja preusmjeravanje); (b) obrazac na postojećoj platformi (Google
   Forms i sl.) kao vanjski link; (c) vlastiti obrazac na logomedo.com (treba server i zaštitu od spama, novi
   posao). **Preporuka: (a)**, adresa koja nije osobna, jer landing nema skripti ni obrazaca, a za alfu je
   dovoljna. Bez odgovora: sekundarni CTA i „Kontakt” se izostavljaju, ostaje samo „Prijava”.
2. **Ime tvrtke u podnožju** (`[IME TVRTKE — S6]`). Opcije: pravno ime (npr. vlasnik računa D.O.M.), samo
   „LogoMedo”, ili ništa. **Preporuka:** pravno ime ako će se pisati i u Privatnosti (P-5); inače samo
   „© 2026. LogoMedo”.
3. **Cijena / „besplatno u alfi”?** Nigdje nije definirano [PO-3]. Opcije: ne spominjati; „besplatno u probnom
   razdoblju”; cijena. **Preporuka:** ne spominjati dok nema odluke; tekst je napisan bez toga.
4. **Demo bilježnica na produkciji** (G-6, V-4, `[DEMO — S6]`). Opcije: (a) napraviti u S6 nakon „go” (pisanje
   u produkcijsku D1) 3–4 zadatka s ilustracijama i odobrenim izgovorom, neutralan naslov, tema Proljeće ili
   Božić; (b) bez demoa, rezerva G-6R sa snimkama. **Preporuka: (a)** — to je jedini način da logoped bez
   pozivnice išta isproba [inventura „Što danas vidi javnost”], uz uvjet da su u demu samo vrste koje rade u
   igri (bez slušnih) i da se demo ne briše slučajno (vlasnik superadmin).
5. **O nama: ime, priča, fotografija; godina starog LogoMeda.** Opcije: neutralno („mali tim”, kako je napisano);
   ime osobe/tvrtke i kratka priča; s fotografijom. Godina prvog LogoMeda (2017. prema privatnom
   `preuzimanje/docs`, nije u inventuri) i opis „zbirka bojanki”: potvrditi. **Preporuka:** neutralno za prvu
   objavu, godinu potvrditi jer daje povjerenje.
6. **Voditelj obrade i kontakt za zaštitu podataka** (P-5). Opcije: ime tvrtke + adresa iz pitanja 1; posebna
   adresa; odgoditi P-5. **Preporuka:** objaviti P-5 tek kad korisnik potvrdi voditelja; do tada stranica
   opisuje samo činjenice bez pravnih obećanja.
7. **Ponoviti brojke na produkciji** (30 / 650+ / 1300+ / 11 / 90). Upiti iz inventure, samo čitanje, u S6
   prije objave. **Preporuka:** da; ako se brojka spusti ispod zaokruženja, smanjiti zaokruženje.
8. **Upute za vježbenice zastarjele** [I-UPU-1] (stanje 2. 11., bez vrsta nakon Scene). Opcije: ne linkati;
   osvježiti pa linkati PDF iz `/radni-listici`. **Preporuka:** ne linkati u v1 (tekst ih ne spominje).
9. **Ispod 404 za `/b/…`:** smije li prerenderirana 404 imati rečenicu za roditelje (pitanje za S5, ne
   sadržajno). **Preporuka:** rečenica za sve, bez uvjeta.
10. **Rečenica „otisak i lice ne napuštaju uređaj”** (P-4): istinita za passkey općenito, ali nije u inventuri
    ni u `docs/admin.md`, pa je izostavljena. **Preporuka:** dodati tek ako korisnik želi i potvrdi.

---

## 6. Prijedlozi odluka (za blok 200)

1. **Putanje:** `/`, `/katalog`, `/radni-listici`, `/igre`, `/o-nama`, `/privatnost` i `404`; **bez
   `/aplikacija`** (na naslovnoj samo „Aplikacija za tablet i mobitel: uskoro”). Nijedna ne dira `/admin`,
   `/api`, `/b`, `/cdn`. Sitemap: šest stranica; 404 i `/b/…` nikad. `robots.txt` zabranjuje `/admin`, `/api`, `/b`.
2. **Navigacija:** zaglavlje Katalog · Radni listići · Igre · O nama + gumb „Prijava”; mobitel `<details>` bez
   skripte; Privatnost samo u podnožju.
3. **Brojke** su zaokružene konstante na jednom mjestu u kodu (30, 650+, 1300+, 2, 11, 90, 2 teme); S6 ponavlja
   upite na produkciji prije objave.
4. **Slušne vrste** („Koje slovo čuješ?”, „Gdje je glas?”) broje se u 11 vrsta jer rade na papiru, a za igru
   piše „uskoro”.
5. **Izgovor** samo kao „upute i odabrane riječi”, uz rečenicu da bez izgovora nema zvučnika; nikad „svaka riječ”.
6. **„AI” i nazivi servisa se ne spominju**; nova slika = „zatražite novu sliku, u okviru tjednog limita”,
   bez brojeva limita (20/50 se mogu mijenjati po logopedu).
7. **Izostavlja se:** praćenje napretka djeteta, aplikacija u trgovinama, registracija bez pozivnice, cijena,
   kvadratne slike, prompt i red generiranja, izbor glasa izgovora, dnevnik aktivnosti kao funkcija (spominje se
   samo „s poviješću izmjena” u Privatnosti), upute za vježbenice.
8. **Demo je uvjetna sekcija** (G-6) s rezervom (G-6R); S3–S5 grade obje, S6 uključi jednu. Kod: jedna
   konstanta `DEMO_URL` (prazna = rezerva).
9. **Placeholderi** `[KONTAKT — S6]`, `[IME TVRTKE — S6]`, `[DEMO — S6]`, `[GODINA — S6]` u kodu su konstante;
   prazna konstanta uklanja element (ne prikazuje se placeholder). Provjera S6: grep za `— S6]` u `dist/` = 0.
10. **Snimke** se rade kao logoped (manje SA elemenata), uz CSS koji sakrije `.tko`; igra bez adresne trake;
    sve probne bilježnice i zadaci na stagingu neutralnih naslova.
11. **Ilustracije** su `.webp` 512 i 256 px u `public/landing/`, preuzete jednom s CDN-a; **OG slika je PNG
    1200 × 630** (iznimka od webp zbog pregleda linkova).
12. **Obraćanje logopedu s „vi”** (malim slovom), alfa se na stranicama zove „probno razdoblje”.
13. **Privatnost bez pravnih obećanja;** P-5 (voditelj obrade) se objavljuje tek nakon odgovora na OP-6.
