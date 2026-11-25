# Plan: odvojiti Upravu od sadržaja u adminu

> **Stanje 25. 11. 2026.: koraci 1–5 napravljeni, na produkciji (25. 11. navečer, verzija 1869de69).** Uz to: korisnici
> preko cijele širine s novom pozivnicom na vrhu („Napravi pozivnicu”, pa Kopiraj / Pošalji e-poštom), vrtuljak na
> POST gumbima u cijelom adminu, staging smije slati mail (samo admini, +aliasi, @logomedo.com). Odluke: ime „Uprava”
> (`/admin/uprava`), Red/Prompt/Aktivnost ostaju u Sadržaju pod „Alati”, Organizacije se ne prikazuju dok ne
> postoje u bazi. Kod: `src/lib/admin/navigacija.ts` (trake), `rute.ts` (`/admin/uprava` prefiks, `PRESELJENO`),
> `src/pages/admin/uprava/` (pregled, korisnici, zahtjevi, uplate, pogodnosti, kuponi, poruke), `lib/admin/uprava.ts`.
> Nova stranica Uprave: datoteka pod `src/pages/admin/uprava/`, `podrucje="uprava"` u AdminOkviru i stavka u
> `TRAKE.uprava`; zaštita je automatska.

Stanje 25. 11. 2026. Bočna traka (`src/components/AdminOkvir.astro`) ima tri skupine sadržaja
(Odobravanje, Sadržaj, Vježbe) i ispod njih deset „alata i postavki” izmiješanih bez reda: Red
generiranja, Prompt, Aktivnost, Ključevi, Korisnici, Zahtjevi, Pogodnosti, Kuponi, Poruke, Postavke.
Pola toga nema veze s izradom materijala: to su korisnici, pristup, novac i dopisivanje. Na stagingu
naplata (uplate, računi kroz domovina-fiskal) živi unutar stranice Zahtjevi, pa će ta hrpa samo rasti
(cijene, paketi, ustanove).

**Cilj:** admin postaje dva područja s vlastitom bočnom trakom.

- **Sadržaj** (`/admin/...`): sve što radi s LogoMedo sadržajem. Isto za superadmina i logopeda.
- **Uprava** (`/admin/uprava/...`): korisnici, pristup, novac, komunikacija, sustav. Samo superadmin.
  Logoped za nju ne zna: nema poveznice, a server je odbija.

## 1. Što ide kamo

| Danas | Područje | Novo mjesto | Zašto |
|---|---|---|---|
| Slike, Izgovor (Odobravanje) | Sadržaj | ostaje | srž |
| Katalog (+ kartice Situacije, Znakovi, Nepoželjne) | Sadržaj | ostaje | srž |
| Novi zadatak, Zadaci, Bilježnice | Sadržaj | ostaje | srž |
| Red generiranja | Sadržaj (dolje, „Alati”) | ostaje `/admin/red` | proizvodnja slika, nije uprava |
| Prompt | Sadržaj („Alati”) | ostaje `/admin/prompt` | isto |
| Aktivnost | Sadržaj („Alati”) | ostaje `/admin/aktivnost` | dnevnik izmjena riječi i slika, linkan s `/admin/rijec/…` |
| Postavke | oba (dolje) | ostaje `/admin/postavke` | osobno: profil, logopedski mod, uređaji |
| Ključevi (passkeys) | osobno | **u Postavke** kao odjeljak „Ključevi”, `/admin/passkeys` → 301 | to su moji ključevi, ne uprava |
| Korisnici (+ pozivnice) | Uprava | `/admin/uprava/korisnici` | |
| Zahtjevi | Uprava | `/admin/uprava/zahtjevi` | |
| (uplate unutar Zahtjeva) | Uprava | **nova** `/admin/uprava/uplate` (popis uplata i računa, PDF) | novac odvojen od odobravanja pristupa |
| Pogodnosti | Uprava | `/admin/uprava/pogodnosti` | |
| Kuponi | Uprava | `/admin/uprava/kuponi` | |
| Poruke (inbox) | Uprava | `/admin/uprava/poruke` | dopisivanje s korisnicima |
| Uređaji svih korisnika (danas samo u bazi, 0044) | Uprava | kasnije `/admin/uprava/uredaji` | kad se uključi limit za logopede (~8. 12.) |
| Organizacije / ustanove | Uprava | kasnije `/admin/uprava/organizacije` | tek kad ustanove s popustom (`/cijene`) dobiju vlastiti model u bazi |
| Klonovi glasa, Glasovi (proba) | Sadržaj (kartice unutar Izgovora) | ostaje | alati za izgovor, iako samo superadmin |
| App prijava (`/admin/app/prijava`) | ostaje gdje je | | nije u traci |

## 2. Kako izgleda

**Traka Sadržaja** (isti raspored kao danas, samo kraća):

```
LogoMedo admin
[ tražilica ]
● Odobravanje   Slike 12 · Izgovor 3
● Sadržaj       Katalog
● Vježbe        Novi zadatak · Zadaci · Bilježnice

Alati           Red generiranja · Prompt · Aktivnost
─────────────
⚙ Uprava  5  →          ← samo superadmin; broj = novi zahtjevi + nepročitane poruke
Postavke
ime · uloga
```

**Traka Uprave** (druga boja naglaska i oznaka „uprava” uz logo, da se odmah vidi gdje si):

```
LogoMedo uprava
← Natrag na sadržaj
Pregled                    ← nadzorna ploča: brojevi ispod, zadnje uplate, novi zahtjevi
● Korisnici    Korisnici i pozivnice · Zahtjevi 3 · (Uređaji)
● Prodaja      Uplate · Pogodnosti · Kuponi · (Organizacije)
● Komunikacija Poruke 2
─────────────
Postavke
ime · uloga
```

Na mobitelu isti hamburger, samo puni drugu traku. Uska traka (`data-traka=uska`) radi u oba područja.

## 3. Tehnički zahvat

1. **Navigacija kao podatak.** Iz `AdminOkvir.astro` izvući popis skupina u čisti TS
   `src/lib/admin/navigacija.ts`: `PODRUCJA = { sadrzaj: [...], uprava: [...] }`, svaka stavka
   `{ kod, href, tekst, ikona, brojac? }`. Okvir dobiva prop `podrucje?: "sadrzaj" | "uprava"`
   (zadano `sadrzaj`) i crta samo tu traku. Brojače (kandidati, zahtjevi, poruke) računa okvir kao
   danas, ali samo one koje traka tog područja prikazuje.
2. **Jedan prefiks umjesto popisa.** U `src/lib/admin/rute.ts` `SAMO_SUPERADMIN` dobiva
   `"/admin/uprava"`, a pojedinačni unosi za korisnike, zahtjeve, pogodnosti, kupone i poruke se brišu.
   Bonus: svaka buduća stranica pod `/admin/uprava/` je zaštićena sama od sebe, bez sjećanja da se doda
   u popis. Ostali unosi (prompt, red, zvukovi/glasovi, klonovi, uređivanje kataloga) ostaju.
3. **Selidba stranica.** `src/pages/admin/{korisnici,zahtjevi,pogodnosti,kuponi}.astro`,
   `zahtjevi/racun/[id].ts` i `poruke/**` → `src/pages/admin/uprava/…`. Svih 39 internih poveznica na
   stare putanje (grep `"/admin/(korisnici|zahtjevi|pogodnosti|kuponi|poruke|passkeys)`) prepisati;
   isto u e-mailovima i obavijestima koje šalju poveznicu u admin (inbox, zahtjevi).
4. **Stare putanje → 301** u middlewareu (mali `PRESELJENO` popis prefiksa), da rade bookmarkovi i
   poveznice iz već poslanih e-mailova. 301 ide tek nakon provjere uloge, da logoped ne sazna da
   `/admin/uprava` postoji (dobiva isto što i danas za te putanje).
5. **Ključevi u Postavke.** Sadržaj `passkeys.astro` postaje odjeljak `#kljucevi` u
   `postavke.astro`; `/admin/passkeys` → 301 na `/admin/postavke#kljucevi`. Passkey ceremonija
   (`/admin/passkey/*`) se ne dira.
6. **Uplate iz Zahtjeva.** Na Zahtjevima ostaje odobravanje i gumb „Simuliraj uplatu” (staging); popis
   uplata, statusi računa i PDF idu na `/admin/uprava/uplate`. Logika ostaje u `lib/admin/uplate.ts`.
7. **Pregled Uprave** (`/admin/uprava`): kartice s brojevima (novi zahtjevi, nepročitane poruke,
   aktivni korisnici, otvorene pozivnice, uplate ovaj mjesec) i poveznicama. Samo čitanje.

**Testovi:**
- `navigacija.test.ts`: svaka stavka područja `uprava` je `rutaSamoSuperadmin`, nijedna stavka
  `sadrzaj` koju logoped vidi to nije, svaki `href` postoji kao datoteka u `src/pages`.
- `revizija-alfa.test.ts`: zamijeniti pojedinačne putanje s `/admin/uprava/...` i dodati da stare
  putanje logopedu i dalje vraćaju odbijanje, a ne 301.
- E2E u Braveu: superadmin prolazi obje trake i stari bookmark; logoped ne vidi gumb „Uprava” i dobiva
  odbijanje na `/admin/uprava/korisnici`.

Migracija baze nije potrebna.

## 4. Redoslijed (svaki korak zaseban deploy na staging)

| # | Korak | Rizik | Gotovo kad |
|---|---|---|---|
| 1 | `navigacija.ts` + prop `podrucje` + traka Uprave, **bez selidbe URL-ova** (Uprava stavke vode na stare putanje) | nizak | na stagingu dvije trake, logoped vidi samo Sadržaj |
| 2 | Selidba na `/admin/uprava/*`, prefiks u `rute.ts`, 301 sa starih, prepisane poveznice, testovi | srednji (poveznice u e-mailovima, middleware) | testovi zeleni, stari bookmarkovi rade, grep ne nalazi staru putanju |
| 3 | Ključevi u Postavke | nizak | `/admin/passkeys` → Postavke, dodavanje ključa radi |
| 4 | `/admin/uprava/uplate` odvojeno od Zahtjeva | nizak (samo staging, naplata) | simulirana uplata → vidi se na Uplatama s PDF-om |
| 5 | Pregled Uprave | nizak | brojevi odgovaraju tablicama |
| 6 | Produkcija | | na tvoj nalog, kao landing |
| — | Kasnije: Uređaji, Organizacije | | kad dođu limit uređaja i ustanove |

Koraci 1 i 2 su jedna sesija; 3–5 druga.

## 5. Otvorena pitanja

1. **Ime i adresa:** „Uprava” i `/admin/uprava`? Alternative: „Administracija” (`/admin/administracija`,
   tautologija) ili poseban poddomen. Preporuka: Uprava.
2. **Red, Prompt, Aktivnost:** ostaju u Sadržaju pod „Alati” (preporuka, jer su proizvodnja i povijest
   sadržaja), ili ih seliti u Upravu kao „Sustav”?
3. **Organizacije:** treba li ih sad samo predvidjeti u traci (sivo, „uskoro”) ili ništa dok ne
   postoji model ustanova u bazi? Preporuka: ništa, da traka ne laže.

## 6. Zamke i otvoreno (25. 11. 2026.)

- **Preusmjeravanje iz middlewarea ne radi za rutu koja ne postoji.** Za `/admin/korisnici` nakon selidbe Astro
  (Cloudflare adapter) vrati 404 i ne dođe do grane middlewarea koja preusmjerava (`PRESELJENO` u `rute.ts`). Zato
  stare adrese imaju catch-all rute `src/pages/admin/<staro>/[...ostalo].ts` (`lib/admin/preseljeno-ruta.ts`).
  `[...ostalo]` pogađa i samu `/admin/korisnici`. Nova selidba stranice: dodati i par u `PRESELJENO` i takvu rutu.
- **Redoslijed u middlewareu:** 301 ide tek nakon provjere uloge, da logoped na staroj adresi dobije „Nemaš pristup”,
  a ne novu adresu. Provjereno curlom s logopedskom sesijom na stagingu.
- **„Pošalji e-poštom” na Korisnicima:** link se ne sprema (u bazi je samo sha-256 tokena), pa ga obrazac rezultata
  vraća u skrivenom polju; server šalje samo ako je token otvorena pozivnica (`otvorenaPoTokenu`) i samo na njen e-mail.
- **Vrtuljak na gumbima** (AdminOkvir, svi POST obrasci): gumb se onemogućuje u `setTimeout(0)`, jer onemogućen
  gumb ne šalje svoj `name/value` (npr. `akcija`). Obrasci s `preventDefault` (fetch) se ne diraju; `data-bez-cekanja`
  isključuje; `data-cekanje="Šaljem…"` mijenja tekst.
- **Otvoreno:** na stagingu se superadmin ponaša kao da ima limit od 2 uređaja (curl pozivi su ga popunili), iako
  `docs/uredaji.md` kaže da je superadmin bez limita. Korisnici pokazuju „limit … se provodi i za superadmina”, dakle
  `UREDAJI_PROVEDBA` na stagingu je vjerojatno „svi”. Nije provjereno je li to namjerno.
- **Neprovjereno:** pravo slanje pozivnice kroz Resend sa staginga (gumb „Pošalji e-poštom”) nitko još nije stisnuo.
