# Bilježnice (u izradi)

Tematski niz zadataka s javnom poveznicom `/b/<slug>`. Prva tema je **božić** („Božićna rima”),
prema Geminijevom prikazu: noćno zimsko nebo, snijeg, drveni okviri kartica, zvučnik uz sliku i
pitanje, bor desno. Svaki točno riješen ekran pali jednu lampicu na boru; na kraju se bor vrti s
upaljenim lampicama.

## Odluke (Matija, 2026-10-31)

- **Slike:** novi stil `ilustracija` (akvarel u boji, bijela pozadina), uz bojanku. Javno se
  prikazuju samo odobrene slike (cdn.logomedo.com): stil bilježnice, pa bojanka, inače riječ.
- **Zvuk:** glas preglednika (`speechSynthesis`, `hr-HR`, glas „Lana” na iPadu/Macu) sada;
  kasnije snimke logopedice po riječi (R2), koje imaju prednost.
- **Pristup:** javna poveznica bez prijave; ništa se ne sprema o djetetu (samo igra i ispis).

## Kako je složeno

- `migrations/0005_biljeznice.sql`: stil `ilustracija` (prompt), tablice `biljeznice`, `biljeznica_zadaci`.
- `src/lib/biljeznice.ts`: popis, `podaci()` za javnu stranicu (odobrene slike, CDN URL),
  `stanjeSlika()`, `generirajSlike()` (red za ilustracije), `spremi()`, `napraviBozicnu()`
  (doda riječi s engleskim opisom za prompt i složi odabir 8, uljez 3, povezivanje 4 para).
- `src/lib/biljeznice-ekrani.ts` (+ test): ekrani igre. Stavka odabira/uljeza = ekran,
  povezivanje = jedan ekran, listić se preskače, nepotpune stavke se ne broje. Broj ekrana =
  broj lampica (`borSvg(n)`), isti na serveru i u pregledniku.
- `src/lib/bor.ts`: `borSvg(n, { zaIspis })`, lampice na 4 girlande (`#lampica-i`, klasa `upaljena`).
- **Igra** `src/pages/b/[slug].astro` + `src/lib/biljeznice-igra.ts`: uvod „Kreni” (dodir
  otključa zvuk), pitanje se pročita (`speechSynthesis`, hr-HR, „Lana” ako postoji), kartice u
  drvenom okviru sa zvučnikom; točno = zelena kartica + zvonce (WebAudio) + lampica; krivo =
  trese se. Kraj: bor u sredini se vrti, lampice trepere, „Bravo!” i „Ponovi”. Kartica bez
  odobrene slike prikazuje samo riječ. Tablet vodoravno: bor desno; uspravno: bor mali dolje desno.
  Padajući snijeg je `.pahulje`.
- **Izgled igre u stilu ilustracija (7. 11. 2026.)**, jer je CSS crtež (nebo, kućice, livada)
  „izgledao kao iz 2000-ih”: pozadina teme je slika (`public/igra/<tema>-vodoravno|uspravno.webp`,
  bira se po orijentaciji), stablo je ilustracija (`public/igra/bor|jabuka.webp`, prozirna pozadina)
  i preko nje SVG lampice/jabuke, `src/lib/stabla-igre.ts` (`tema.ukrasIgre(n)`). Mjesta lampica
  slaže po obrisu krošnje (`src/lib/igra-stabla.ts`: lijevi i desni rub po redovima), pa radi za
  bilo koji N; granice krošnje po visini su `KRUNA` u `stabla-igre.ts` (ručno, mijenjaju se s
  novom slikom). Kartice, pitanje i uvod su u papirnatim tonovima (krem, obrub olovke).
  Nova slika: `scripts/igra-slike.sh <dir> [ime]` (Vertex, stil `ilustracija`, ~$0,04 po slici;
  treba bash 4, npr. `/opt/homebrew/bin/bash`), pa `python3 scripts/igra-obrada.py <dir>`
  (izreže stabla, webp, osvježi obris). Prvi set je prošao iz prvog pokušaja (6 slika).
  Ispis i PDF i dalje crtaju stara SVG stabla (`bor.ts`, `jabuka.ts`) jer trebaju obrise za bojanje.
- **Ispis** `src/pages/b/[slug]/ispis.astro`: A4, naslovnica s borom za bojanje lampica,
  odabir 3 / uljez 4 / povezivanje 1 po stranici, grančice u kutovima.
- **CSP** (`src/middleware.ts`): `img-src` uključuje `env.CDN_URL`.
- **Admin** `/admin/biljeznice` („Napravi Božićnu rimu”) i `/admin/biljeznice/[id]` (naslov,
  podnaslov, slug, javna, redoslijed zadataka brojem, dodavanje zadatka, stanje slika,
  „Generiraj ilustracije”, poveznice na igru i ispis). Stranice same obrađuju POST (kao `/admin/red`).
- Provjereno lokalno u headless Chromiumu (31. 10. 2026.): svih 12 ekrana do kraja, bez grešaka u
  konzoli; izgled sa slikama i bez njih, mobitel uspravno, ispis, spremanje u adminu, 404, CSP.

## Riječi za božićnu vježbenicu (migracija 0006)

`scripts/seed-bozic.ts` → `migrations/0006_rijeci_bozic.sql`: 103 riječi s dva rukom pisana
popisa (abecedni božićni popis i riječi s 3 i 4 glasa), svaka s engleskim opisom za prompt.
Opis je uobičajeno značenje, da se slike mogu koristiti i u drugim zadacima. Postojeće riječi
zadržavaju svoj opis. Na produkciji primijenjeno 31. 10. 2026. (44 su već postojale, 59 novih).
Izostavljen je GRINČ (zaštićeni lik); dvosmislene riječi BAL, DJED i GRAD imaju opće značenje
(ples, djed, grad), pa ih po potrebi treba ispraviti na stranici riječi.

## Ostalo

1. Generiranje ~22 ilustracije ide kroz kvotu agyja (~12 pa 3–5 h čekanja): gumb u adminu
   bilježnice. Nakon toga ih odobriti u Pregledu (tek odobrene idu na CDN i u igru).
2. Popis riječi i parova neka pregleda Anita (logopedica).
3. Izgovor: ElevenLabs snimke s pregledom (`docs/zvukovi.md`, 4. 11. 2026.); glas preglednika je zamjena.

## Nova bilježnica i teme (2. 11. 2026., na produkciji)

- `/admin/biljeznice`: forma „Nova bilježnica” (naslov ≥ 3, poveznica ≥ 3 i nezauzeta, tema), provjera
  u pregledniku i na serveru (`provjeriPolja`). „Primjer: Božićna rima” ostaje.
- `/admin/biljeznice/[id]`: tema, greška za zauzetu poveznicu, uz zadatak broj ekrana ili
  „nije spreman za igru” (`brojEkrana([z]) === 0`).
- Teme (`src/lib/teme.ts`, migracija 0011): `bozic` (bor, lampice) i `proljece` (livada,
  `src/lib/jabuka.ts`: stablo s N plodova istih razreda kao lampice, pa igra ne zna temu).
  Igra (`tema-<kod>` na body), HTML ispis i PDF naslovnica uzimaju ukras i tekstove iz teme;
  grančice u kutovima samo za božić.
- Upute za logopede: `docs/upute-vjezbenice.md`, PDF `docs/pdf/upute-vjezbenice.pdf`
  (pandoc → HTML → Chromium `page.pdf`).
