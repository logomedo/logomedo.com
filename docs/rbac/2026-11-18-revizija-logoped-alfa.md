# Revizija: logoped u alfi (18. 11. 2026.)

Pitanje: može li logoped kao vanjski korisnik (alfa, ~25 ljudi) napraviti nered u zajedničkim podacima,
vidjeti tuđe osobne podatke ili potrošiti AI budžet mimo kvote? Superadmin se ne mijenja.

Metoda: svi ulazi (`export const POST`, `Astro.request.method === "POST"`, GET rute koje vraćaju podatke,
`/admin/slika`, `/admin/zvuk`, passkey, poziv), provjera na serveru, tablice koje diraju. Polazište:
`lib/admin/ovlasti.ts`, `rute.ts` (`SAMO_SUPERADMIN`), `middleware.ts`, `vlasnistvo.ts`, `zatrazio.ts`, `kvota.ts`.

Klasifikacija: **OK** (zatvoreno na serveru), **ZATVORITI** (logoped dira zajedničko ili tuđe, ili vidi
tuđe), **ODLUKA** (korisnik bira), **NIJE PROBLEM** (samo njegovo, ili nije osjetljivo).

## Tablica ulaza

| Ulaz | Logoped smije | Provjera (server) | Tablice | Klas. | Prijedlog |
|---|---|---|---|---|---|
| `/admin/prompt`, `/admin/red`, `/admin/korisnici`, `/admin/zvukovi/glasovi`, `api/zvuk-proba`, `/admin/app/prijava`, `api/app-kod`, `api/rijec/*`, `api/novi-glas`, `/admin/novi-glas` | ne | middleware `rutaSamoSuperadmin` (403, i na kodiranu putanju) | — | OK | — |
| POST `/admin/znakovi`, `/admin/nepozeljne`, `/admin/zvukovi/snimke` | ne (samo čita) | `katalog.uredivanje` u stranici, 403 | — | OK | — |
| POST `/admin/situacije` osim `generiraj`/`ponovi` | ne | `katalog.uredivanje`, 403 | — | OK | — |
| POST `/admin/situacije` `generiraj`/`ponovi` | da, kroz kvotu | `batchSKvotom` | `pozadina_generiranja` → `pozadina_slike` | ODLUKA (blaga) | generirana slika ide u zajedničku situaciju bez pregleda, ali samo kad joj nedostaje druga orijentacija; superadmin je može maknuti. Preporuka: ostaviti |
| `/admin/api/aktivnost/[id]` (Poništi/Vrati) | samo svoje grupe na bilježnicama | `aktivnostFiltar` + `smijeVratitiGrupu` | — | OK | — |
| `/admin/api/aktivnost` (GET), `/admin/aktivnost` | samo svoje zapise | `aktivnostFiltar` | — | OK | — |
| `/admin/api/generiraj` (riječ ili cijeli `glas`) | da | `dodajURed` → `batchSKvotom`, atomski za logopeda (masovno preko preostalog = odbijeno cijelo) | `generiranja`, `ai_potrosnja` | OK | slobodna `napomena` ide u prompt; prihvatljivo |
| `/admin/api/upload` | da (8 MB, kandidat) | sesija; bez kvote (nema AI troška) | `slike`, R2 | NIJE PROBLEM | kandidat vidi samo on dok ga ne odobri (vidi ODLUKA 2) |
| `/admin/api/slika/[id]` `odobri`/`odbij` | samo svoje (`smijeOSlici`) | `smijeOSlici` | `slike` | ODLUKA 2 | odobrena slika logopeda postaje odobrena za sve (katalog, igre, CDN) |
| `/admin/api/slika/[id]` `vrati` | **svoje, i kad je superadmin već odlučio** | samo `smijeOSlici`, bez provjere tko je odlučio | `slike` | **ZATVORITI** | superadmin odbije logopedovu sliku → logoped „Vrati u kandidate” → „Odobri” → globalno odobrena. Isto „Makni iz odobrenih” na slici koju je odobrio superadmin. Logoped smije `vrati` samo kad je zadnju odluku donio on (`pregledao` = on) |
| `/admin/api/slika/[id]` `akcija=stil` | svoje, bilo kojeg statusa | samo `smijeOSlici` | `slike.stil_id` | **ZATVORITI** | odobrenu sliku (koju je odobrio superadmin) seli bojanka ↔ ilustracija u katalogu za sve. Isto pravilo: kandidat ili vlastita odluka |
| `/admin/api/slika/[id]/premjesti` | svoj kandidat; nepostojeća riječ se dodaje | `smijeOSlici`, samo `kandidat` | `slike`, `rijeci`, `rijec_glas`, R2 | ODLUKA 1 + **ZATVORITI** | kopija je odmah **odobrena** na ciljnoj riječi (vidi ODLUKA 2); ne gleda nepoželjne; vraća obrisanu riječ |
| `/admin/api/nova-rijec` | da | nepoželjne da; obrisana riječ se vraća (`ON CONFLICT … aktivna = 1`) i **pregazi joj opis, rečenicu, rimu** | `rijeci`, `rijec_glas` | ODLUKA 1 + **ZATVORITI** | logoped ne smije vratiti obrisanu riječ (odluka 604 b) |
| `/admin/api/rijeci` (editor zadatka) | da | **ne gleda nepoželjne**; vraća obrisanu | `rijeci` | ODLUKA 1 + **ZATVORITI** | nepoželjne i obrisane kao gore |
| POST `/admin/zvukovi` `odobri` | svoje | `svojiZvukovi` | `zvukovi`, R2 JAVNO | ODLUKA 2 | odobrenje **zamjenjuje** dosadašnju odobrenu (i superadminovu) snimku za sve i briše je s CDN-a; usput odbija tuđe kandidate istog teksta |
| POST `/admin/zvukovi` `ponovi` (Snimi ponovo) | bilo koji tekst bez kandidata i posla | kvota; **ne gleda postoji li odobrena** | `zvuk_generiranja` | **ZATVORITI** (uz ODLUKU 2) | logoped tako dolazi do kandidata za tekst koji već ima odobren izgovor i zamijeni ga. Logoped: samo tekst bez odobrene |
| POST `/admin/zvukovi` `odbij` / `odbij-samo` / `greske` | svoje | `svojiZvukovi`, `svojeGreske`, kvota | — | OK | — |
| POST `/admin/zvukovi` `zaglavljeni` (Pogurni red) | **da, cijeli red** | ništa | `zvuk_generiranja` (svi) | **ZATVORITI** | bez troška po kvoti, ali zastario `radi` vraća u `ceka` za sve korisnike (moguć dvostruk ElevenLabs poziv). Samo superadmin |
| `/admin/api/kandidati` (GET, svake 3 s) | kandidati samo svoji | `pregledFiltar` za kandidate; **`nedavneOdluke()` bez filtra** | — | **ZATVORITI** | vraća `pregledao` (e-mail) za svaku odluku u zadnjih 30 min, svih korisnika. Logoped: samo odluke o svojim slikama, bez e-maila |
| `/admin/rijec/[slug]` „Dodao: …” | vidi | ništa | — | **ZATVORITI** | ime ili e-mail drugog logopeda koji je dodao riječ. Logoped: „ti” za svoje, ništa za tuđe |
| `/admin/zvukovi` tab Odobreno/Odbijeno: `· pregledao` | vidi | ništa | — | **ZATVORITI** | e-mail onoga tko je odlučio (superadmin ili drugi logoped kroz „zamijenjen novijom”). Samo superadmin |
| `/admin/pregled` „X je već odobrio” (odgovor `vec.pregledao`) | vidi | — | — | ZATVORITI (dio gornjeg) | logoped dobiva e-mail; zamijeniti s „netko drugi” |
| Zadaci (`api/zadatak`, `/admin/zadaci*`, `dijete`) | svoje | `autorFiltar` u SQL-u (tuđe = 404) | `zadaci` | OK | — |
| Bilježnice (`/admin/biljeznice*`), dodavanje zadataka | svoje; tuđi zadatak samo ako je već bio u bilježnici | `autorFiltar`, `spremi` provjerava autora zadatka | `biljeznice`, `biljeznica_zadaci` | OK | — |
| Javna bilježnica `/b/<slug>` | logoped je može objaviti | — | — | ODLUKA 3 | njegov naslov/podnaslov na logomedo.com bez prijave; `/b/<slug>` (igra) **nema noindex** (ispis ima) → ZATVORITI: dodati noindex |
| Predlošci (`/admin/predlosci` → `api/zadatak`) | stvara svoj zadatak | `korisnikId` kao autor | `zadaci` | OK | — |
| `/admin/postavke` profil, logopedski mod | svoje | `spremiProfil` odbija tuđi, superadminov i pozvani e-mail | `korisnici` + `STUPCI_EMAILA` | OK | e-mail se ne potvrđuje (samo oznaka; prijava ide passkeyem) |
| `/admin/passkeys`, `passkey/register/*` | samo svoj | e-mail iz sesije | `admin_passkeys` | OK | — |
| `/admin/poziv*` | javno, s tokenom | token iz linka, Origin | `pozivi` | OK | — |
| CSRF | — | middleware: Origin mora biti isti za svaki ne-GET | — | OK | — |
| `/admin/slika/[id]` | bilo koja slika po ID-u | sesija | — | NIJE PROBLEM | slike riječi nisu osobne; tuđe kandidate logoped ionako vidi na stranici riječi |
| `/admin/zvuk/[id]` | bilo koja snimka po ID-u | sesija | — | **ZATVORITI** (nisko) | uključuje odbijene snimke glasova (`/s/`, glas stvarne osobe). Logoped: odobrene + svoje |
| `/api/v1/*` | samo `ja`, `odjava`; `/api/v1/admin/*` ne | middleware: `uloga !== "admin"` → 403 | — | OK | — |
| `/api/runner/*` | ne | bearer token | — | OK | — |

## AI trošak

Svi upisi poslova (`grep INSERT INTO generiranja|pozadina_generiranja|zvuk_generiranja`) idu kroz kvotu;
inventar iz `research/2026-11-16-tocke-troska.md` je i dalje točan (nema novih mjesta). Probe glasova su
samo superadmin. Jedini ulaz bez kvote koji logoped može okinuti je „Pogurni red” (gore, ZATVORITI);
on ne stvara nove poslove.

Gornja granica uz zadane limite (cijene **nisu** u repou, procjena za provjeru na računima):

- slike: 25 × 50 = **1 250 slika tjedno**. Uz ~0,04–0,13 USD po slici (Nano Banana razred) to je
  **~50–160 USD tjedno** ako svi potroše sve.
- izgovori: 25 × 200 = **5 000 poslova tjedno**; posao s varijantama je do 3 TTS poziva + STT, ~10 znakova
  po riječi → do **~150 000 znakova tjedno**. To je više od mjesečne kvote manjih ElevenLabs planova:
  provjeriti plan prije alfe. Kvota štiti budžet po osobi, ne ukupni.

## ODLUKA KORISNIKA

1. **Nova riječ** (forma, editor zadatka, premještanje slike na novu riječ). 25 ljudi puni zajednički katalog.
   - (preporuka) Ostaviti, ali logoped ne smije vratiti obrisanu riječ ni dodati nepoželjnu (na sva tri
     mjesta); superadmin briše smeće. Najmanje posla, katalog ostaje otvoren.
   - Samo superadmin.
   - Riječ logopeda „na čekanju” (vidi je samo on dok je superadmin ne odobri): migracija + filtar u
     svim upitima kataloga, otprilike pola dana.
2. **Odobrenje logopeda** (slike i izgovori) danas je odmah globalno.
   - (preporuka) Logoped odobrava za sebe, superadmin potvrđuje za sve: novi status „predložena”
     (logoped je vidi i koristi u svojim zadacima, superadmin je na `/admin/pregled` potvrdi ili odbije).
     Za izgovore: logopedovo odobrenje smije popuniti samo tekst bez odobrene snimke.
   - Ostaviti kako je, uz ZATVORITI stavke (bez vraćanja superadminove odluke, bez zamjene odobrenog izgovora).
   - Logoped uopće ne odobrava; samo šalje, superadmin pregledava sve.
3. **Javne bilježnice**: logoped objavljuje stranicu na logomedo.com bez prijave.
   - (preporuka) Ostaviti (to je svrha: link roditelju), uz noindex na `/b/<slug>`.
   - Javnu bilježnicu objavljuje samo superadmin.
4. **Kvote za alfu**: zadano 50 slika / 200 izgovora tjedno po logopedu.
   - (preporuka) Za alfu sniziti zadano na 20 / 50 (superadmin pojedincu podiže na /admin/korisnici).
   - Ostaviti 50 / 200.

## ZATVORITI (bez odluke)

1. Slika `vrati` i `akcija=stil`: logoped samo na kandidatu ili kad je zadnju odluku donio on.
2. Izgovor `ponovi`: logoped samo za tekst bez odobrene snimke.
3. „Pogurni red” (`zaglavljeni`): samo superadmin.
4. Nepoželjne riječi i vraćanje obrisane riječi blokirani u `api/nova-rijec`, `api/rijeci` i `premjesti`
   (za logopeda; ovisi o ODLUCI 1).
5. Osobni podaci: `nedavneOdluke` filtrirati na logopedove slike i bez e-maila; „Dodao” samo superadminu
   (logopedu „ti”); `pregledao` na `/admin/zvukovi` samo superadminu; `vec.pregledao` logopedu bez e-maila.
6. `/admin/zvuk/[id]`: logoped samo odobrene i svoje.
7. `/b/<slug>`: `<meta name="robots" content="noindex">`.
