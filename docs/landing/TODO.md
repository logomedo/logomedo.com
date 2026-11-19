# TODO: landing stranice + staging

Radna lista. Čuva se u repou da napredak preživi između sesija. Označene stavke su gotove
i provjerene (`npm test && npm run check && npm run build` zelen). Odluke idu u [decisions.md](decisions.md).

Plan po sesijama: [plan.md](plan.md). Handoff po sesiji: [handoffs/](handoffs/).

Legenda: `[x]` gotovo · `[ ]` otvoreno · `[~]` u radu · `(!)` traži korisnika · `→ Sn` planirana sesija

## F0: staging (na `main`, produkcija se ne mijenja)

- [x] Izmjeriti kako `@astrojs/cloudflare` bira okruženje (`CLOUDFLARE_ENV`) i kamo piše `wrangler.json`; zapis u `research/` → S1
- [x] `env.staging` u `wrangler.jsonc`: Worker `logomedo-staging`, ruta `staging.logomedo.com` (custom domain), vlastiti D1/R2/queue/DO, `vars` za staging → S1
- [x] Dokaz da je produkcijski build nepromijenjen: `dist/server/wrangler.json` prije i poslije jednak (diff prazan) → S1
- [x] Staging build ne dijeli `dist/` s produkcijskim (paralelne sesije) → S1
- [x] `npm run deploy:staging`, `npm run db:migrate:staging` → S1
- [x] Resursi: `wrangler d1 create logomedo-staging`, R2 `logomedo-staging-slike` i `logomedo-staging-javno`, queue `logomedo-staging-zvukovi` → S1
- [x] Zaštita staginga: Basic Auth za cijeli host kad je `OKRUZENJE=staging` (osim `/api/v1`, `/api/runner/*`), i za statičke datoteke; `x-robots-tag: noindex`; testovi da produkcija bez `OKRUZENJE` radi kao prije → S1
- [x] Kopija produkcijske D1 u `logomedo-staging` (`scripts/staging-osvjezi.sh`), dump samo izvan repoa i obrisan nakon importa → S1
- [x] Prijava u admin na stagingu bez Accessa i passkeya: `scripts/staging-sesija.sh` upisuje sesiju u staging D1 → S1
- [x] e2e: `curl` bez lozinke 401, s lozinkom 200 na `/`, admin sa sesijom 200, broj redaka ključnih tablica staging = produkcija u trenutku kopije → S1
- [x] `docs/staging.md` (kako se deploya, osvježava, prijavljuje, što ne radi) → S1

- [x] Staging bez Basic Autha, javni dio otvoren, noindex, `/admin` kao produkcija (odluka 207) → S2
- [ ] (!) Access aplikacija za `staging.logomedo.com/admin/sso`, AUD u `env.staging` (odluka 208) → kad korisnik pošalje AUD

## F1: sadržaj i kostur (grana `landing`)

- [x] Inventura funkcija koje danas rade na produkciji, s putanjom koda i dokazom → S2
- [x] Arhitektura stranica i tekstovi na hrvatskom u `docs/landing/sadrzaj.md` → S2
- [x] Popis snimki zaslona i ilustracija (izvor, stranica, provjera osobnih podataka) → S2
- [x] `src/landing/` (layout, zaglavlje, podnožje, sekcije), stranice s `export const prerender = true` → S3
- [x] `public/_headers`: CSP i ostala zaglavlja za statičke stranice, jednako stroga kao `zastiti()` u `src/middleware.ts` → S3
- [x] `robots.txt`, `sitemap.xml`, OG slika i meta po stranici, 404 → S3
- [x] Naslovna `/` → S3
- [x] `scripts/landing-provjera.sh <host>`: svaka stranica 200, zaglavlja, interni linkovi bez 404, sitemap → S3

## F2: stranice

- [ ] `scripts/landing-snimke.ts`: snimke zaslona sa staginga (Playwright), bez osobnih podataka → S4
- [ ] Stranice `/katalog` i `/radni-listici` (kosturi s hero sekcijom postoje od S3, odluka 305); V-2…V-4 u N-2 naslovne → S4
- [ ] Stranice `/igre`, `/o-nama`, `/privatnost`, 404 (bez `/aplikacija`, odluka 200) → S5

## F3: pregled i produkcija

- [ ] Lighthouse po stranici (staging), a11y, mobitel 360 px, tamna tema; brojke u `research/` → S6
- [ ] `/code-review` grane `landing`, nalazi popravljeni ili zapisani → S6
- [ ] (!) Korisnik pregleda staging i kaže „go”; otvorena pitanja (kontakt adresa) odgovorena → S6
- [ ] (!) www → apex za statičke stranice (odluka 306) → S6
- [ ] Merge `landing` u `main`, `npm run deploy`, provjera `scripts/landing-provjera.sh logomedo.com` i admina → S6
