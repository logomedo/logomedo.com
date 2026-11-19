# Plan: landing stranice + staging

## Zašto

`logomedo.com/` je danas onepager od 35 redaka, a aplikacija iza njega već ima katalog slika po
glasovima, radne listiće s PDF-om, igre za dijete i Flutter app. Treba višestranični landing koji
pokazuje ono što stvarno radi. Produkcija se pri tome ne smije dirati dok korisnik ne kaže „go”,
a za to prvo treba staging, kojeg do sada nije bilo (jedan Worker, jedan D1, `stage.logomedo.com`
je stari Firebase).

## Arhitektura

| | Produkcija | Staging |
|---|---|---|
| Worker | `logomedo` | `logomedo-staging` (`env.staging`) |
| Host | `logomedo.com`, `www` | `staging.logomedo.com` |
| D1 | `logomedo` | `logomedo-staging` (kopija produkcije, odluka 5) |
| R2 | `logomedo-slike`, `logomedo-javno` | `logomedo-staging-slike`, `logomedo-staging-javno` |
| Slike na stranicama | `cdn.logomedo.com` | `cdn.logomedo.com` (samo čitanje, odluka 6) |
| Zaštita | Access na `/admin/sso` + passkey | javno + noindex, `/admin` kao produkcija (odluka 207) |
| Deploy | `npm run deploy` (s `main`) | `npm run deploy:staging` (s grane `landing` ili `main`) |

Landing stranice su prerenderirane (`export const prerender = true`) i servira ih Cloudflare kao
statičke datoteke; admin, API, `/b/…` i `/cdn` ostaju SSR kroz `src/worker.ts` i middleware.

## Tvrdi uvjeti (svaka sesija)

- Produkcija (`npm run deploy`, `npm run db:migrate`, produkcijski secreti) samo u S6, nakon „go”.
  Izuzetak: S1 smije **čitati** produkcijsku D1 (`wrangler d1 export`) radi kopije.
- Landing kod samo na grani `landing` (odluka 2); staging konfiguracija u `main` (odluka 3).
- Javni repo: nikakvi osobni podaci, e-mailovi ni lozinke (odluka 14).
- Landing tvrdi samo što radi na produkciji (odluka 10).

## Sesije

| # | Faza | Paket | Odluke | Gotovo kad |
|---|---|---|---|---|
| S0 | | Plan | 1–17 | ovaj dokument, handoffi S1–S6 |
| S1 | F0 | Staging okruženje, kopija D1, zaštita, skripte | 100–199 | `curl` na `staging.logomedo.com`: 401 bez lozinke, 200 s njom; admin sa skriptnom sesijom 200; prod `wrangler.json` diff prazan; testovi zeleni |
| S2 | F1 | Inventura funkcija, arhitektura stranica, tekstovi, popis snimki | 200–299 | `docs/landing/sadrzaj.md` sa svim stranicama, svaka tvrdnja s putanjom koda; grana `landing` postoji na originu |
| S3 | F1 | Kostur, `_headers`, SEO, naslovna, provjera | 300–399 | `scripts/landing-provjera.sh staging.logomedo.com` zelen; `curl -I /` ima CSP iz `_headers` |
| S4 | F2 | Snimke zaslona, stranice katalog i radni listići | 400–499 | stranice na stagingu, provjera zelena, snimke pregledane (popis u `research/`) |
| S5 | F2 | Igre, aplikacija, o nama, privatnost | 500–599 | sve stranice iz `sadrzaj.md` na stagingu, provjera zelena |
| S6 | F3 | Lighthouse, code review, **vrata**, produkcija | 600–699 | nakon „go”: `scripts/landing-provjera.sh logomedo.com` zelen, admin radi, `wrangler deployments list` pokazuje ovu verziju |

**Procjena:** 6 sesija (S1–S6), S4 ili S5 se mogu razdvojiti ako snimke ili interaktivni demo
narastu. **Vrata:** samo S6 (odluka 16). Ako S1 ne može stvoriti R2 ili domenu s postojećim
wrangler OAuth ovlastima, S1 staje s pitanjem korisniku (`wrangler login`).
**Paralelno:** ništa; S4 i S5 dijele layout i `sadrzaj.md`.
**Najrizičnije:** S1, jer prvi put uvodi okruženja u `wrangler.jsonc`, a Astro adapter generira
`dist/server/wrangler.json` kod builda; pogreška bi mogla promijeniti produkcijski deploy. Zato
S1 mjeri adapter prije izmjene i dokazuje prazan diff. Drugi rizik je CSP statičkih stranica (S3).

## Gdje smo

S0 (19. 11. 2026.): plan napisan, koda nema. Polazno stanje: 276 testova (pass 276, skipped 0),
`check` 0 grešaka, build prolazi.

S2 (19. 11. 2026.): inventura (`research/2026-11-19-inventura.md`) i `sadrzaj.md`: šest stranica i 404, bez
`/aplikacija` (odluka 200). Staging bez Basic Autha (odluka 207). 287 testova (pass 287, skipped 0).

S3 (19. 11. 2026.): kostur `src/landing/`, naslovna, kosturi ostalih pet stranica, `public/_headers`, robots,
sitemap, OG, 404, `scripts/landing-provjera.sh` (staging 89 OK, 0 grešaka). 296 testova (pass 296, skipped 0).
