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

## Gotovo (nije deployano, migracija 0005 nije primijenjena)

- `migrations/0005_biljeznice.sql`: stil `ilustracija` (prompt), tablice `biljeznice`,
  `biljeznica_zadaci`.
- `scripts/runner.sh`: SVG (potrace) samo za stil `bojanka`.
- `src/lib/biljeznice.ts`: popis, `podaci()` za javnu stranicu (odobrene slike, CDN URL),
  `stanjeSlika()`, `generirajSlike()` (red za ilustracije), `spremi()`,
  `napraviBozicnu()`: doda riječi s engleskim opisom za prompt i složi 3 zadatka:
  - odabir (8): BOR→ŠATOR, POKLON→SLON, KAPA→ŠAPA, SVIJEĆA→VREĆA, KOLAČ→TRUBAČ, ČAJ→ZMAJ, ŠAL→VAL, SNIJEG→BRIJEG
  - uljez (3): POKLON/SLON/BALON+SANJKE, BOR/ŠATOR/TRAKTOR+ZVONO, KOLAČ/TRUBAČ/PLIVAČ+SNIJEG
  - povezivanje (4 para): KAPA–ŠAPA, ČAJ–ZMAJ, ŠAL–VAL, POKLON–SLON
  - ukupno 12 ekrana = 12 lampica. Uputa odabira ima `{zadana}` (zamjenjuje se riječju).
- `src/lib/bor.ts`: `borSvg(n, { zaIspis })`: SVG bor, n lampica na 4 girlande
  (`#lampica-i`, klasa `upaljena`); za ispis prazni krugovi za bojanje. Raspored girlandi
  još nije provjeren okom.
- `@fontsource-variable/nunito` instaliran (zaobljeni font za djecu).

## Ostalo

1. **Igra** `src/pages/b/[slug].astro` + klijent `src/lib/biljeznice-igra.ts`:
   - ekrani: svaka stavka odabira i uljeza je jedan ekran, povezivanje je jedan ekran
   - uvodni ekran „Kreni” (treba dodir zbog zvuka), pitanje se pročita naglas
   - kartice: drveni okvir, krem unutra, riječ + slika + okrugli plavi zvučnik
   - točno: zelena kartica, zvonce (WebAudio), lampica se pali; krivo: trese se
   - kraj: bor se vrti (`rotateY`), lampice trepere, „Bravo!” i „Ponovi”
   - pozadina: CSS noćno nebo, snijeg koji pada, SVG brežuljci i kućice; tablet vodoravno
     je glavni format, mobitel uspravno složen
2. **Ispis** `src/pages/b/[slug]/ispis.astro`: A4; naslovnica s borom za bojanje lampica,
   odabir 3 stavke po stranici, uljez 4, povezivanje 1; svečani rub (SVG grančice u kutovima).
3. **Middleware CSP**: `img-src` mora dopustiti `env.CDN_URL` za javne stranice.
4. **Admin** `/admin/biljeznice` (popis, „Napravi Božićnu rimu”) i `/admin/biljeznice/[id]`
   (naslov, slug, javna, redoslijed zadataka, stanje slika po riječi, „Generiraj ilustracije”,
   poveznice na igru i ispis); stavka u izborniku `AdminOkvir`.
5. Provjera (`npm test && npm run check && npm run build`), lokalni test u headless pregledniku
   (scratchpad skripta playwright-core), `wrangler d1 migrations apply --remote` i deploy s
   `CLOUDFLARE_ACCOUNT_ID=7dc7167b7e2e00923bfa7cd697df14e4`.
6. Generiranje ~22 ilustracije ide kroz kvotu agyja (~12 pa 3–5 h čekanja): pokrenuti iz admina
   bilježnice nakon deploya.
