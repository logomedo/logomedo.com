# Odluke: landing stranice + staging

Svaka odluka ima broj, datum, razlog i uvjet revizije. Odluka se ne briše: nova je zamjenjuje
(„zamjenjuje N”). Blokovi po sesiji: S0 1–99, S1 100–199, S2 200–299, S3 300–399, S4 400–499,
S5 500–599, S6 600–699. Brojevi su zasebni od lanca RBAC (`docs/rbac/decisions.md`); u tekstu
izvan ovog direktorija piši „landing odluka N”.

## S0 (19. 11. 2026.)

1. **Landing je u ovom repou i u istom Workeru.** Stranice su u `src/pages/` s
   `export const prerender = true`, komponente u `src/landing/`. Razlog: landing mora biti na
   `logomedo.com/` uz `/admin`, `/api/v1`, `/b/…` i `/cdn`; zaseban deployment bi dijelio domenu po
   putanjama ili išao na subdomenu. Prerenderirane stranice Cloudflare servira kao statičke
   datoteke, bez D1 i bez middlewarea, pa ne mogu srušiti admin. Revizija: ako landing treba CMS
   ili ga uređuje netko drugi.
2. **Landing nastaje na grani `landing`**, koja se na početku svake sesije S2–S6 rebasea na
   `origin/main`. Razlog: druge sesije svaki dan deployaju produkciju iz `main`
   (memorija „deploy tijek”), pa bi pola gotov landing s njima otišao na `logomedo.com`. Staging
   se deploya s grane `landing`. Merge u `main` je tek u S6 nakon „go”.
3. **Staging je u `main` (S1).** Konfiguracija `env.staging` i Basic Auth iza `OKRUZENJE=staging`
   ne mijenjaju produkciju, a staging koristi i drugim lancima. Uvjet: dokaz u S1 da je
   produkcijski `dist/server/wrangler.json` nepromijenjen i da testovi produkcijskog ponašanja
   prolaze.
4. **Staging:** Worker `logomedo-staging` na `staging.logomedo.com` (custom domain, zona
   logomedo.com). `stage.logomedo.com` ostaje stari Firebase stage. Vlastiti D1
   `logomedo-staging`, R2 `logomedo-staging-slike` i `logomedo-staging-javno`, queue
   `logomedo-staging-zvukovi`, Durable Object u Workeru staginga. Staging nikad ne binda
   produkcijske resurse.
5. **Podaci staginga su kopija produkcijske D1** (korisnik, 19. 11. 2026.). Dump ide izvan repoa
   (`~/.cache/logomedo-staging/`) i briše se nakon importa; nikad u git ni u `docs/`. Kopija
   sadrži e-mailove i podatke logopeda, pa je staging cijeli iza lozinke (odluka 7) i `noindex`.
   Osvježavanje je `scripts/staging-osvjezi.sh`, ručno, ne po rasporedu.
6. **Slike na stagingu:** `CDN_URL` staginga je `https://cdn.logomedo.com` (javne odobrene slike,
   samo čitanje preko HTTP-a). Privatni kandidati iz `logomedo-slike` se na stagingu ne vide.
   Revizija: ako landing ili testovi trebaju kandidate.
7. **Zaštita staginga bez Accessa.** Wrangler OAuth na ovom računalu nema Access ovlast
   (`~/Library/Preferences/.wrangler/config/default.toml`, scopes), pa Access aplikacija ne može
   nastati autonomno. Basic Auth u Workeru (secret `STAGING_LOZINKA`) štiti cijeli host kad je
   `OKRUZENJE=staging`, uključujući statičke datoteke; `/api/v1` i `/api/runner/*` imaju vlastitu
   provjeru i izuzeti su. Revizija: korisnik može kasnije dodati Access aplikaciju za
   `staging.logomedo.com` u dashboardu.
8. **Admin na stagingu:** sesija se upisuje u staging D1 skriptom (kao lokalno u `docs/admin.md`),
   jer passkeyevi s produkcije ne vrijede (rpID je hostname), a Accessa nema.
9. **Staging ne troši.** Bez secreta vanjskih servisa (ElevenLabs, `RUNNER_TOKEN`,
   `CF_PURGE_TOKEN`, Vertex). Poslovi izgovora na stagingu padaju i to je u redu.
10. **Landing tvrdi samo ono što danas radi na produkciji.** Što je u izradi piše se kao „uskoro”
    ili se izostavlja. Inventura u S2 za svaku tvrdnju bilježi putanju koda.
11. **Više stranica** (korisnik, 19. 11. 2026.). Prijedlog: `/` naslovna, `/katalog`,
    `/radni-listici`, `/igre`, `/aplikacija`, `/o-nama`, `/privatnost`. Konačni popis i imena
    određuje S2 (odluka u bloku 200).
12. **Bez analitike, kolačića i vanjskih skripti ili fontova u v1.** Fontovi su već lokalni
    (`@fontsource-variable/*`, Andika). Zato ne treba cookie banner. Revizija: kad korisnik
    zatraži analitiku.
13. **Sigurnosna zaglavlja statičkih stranica idu u `public/_headers`**, jer statičke datoteke ne
    prolaze kroz `zastiti()` u `src/middleware.ts`. CSP bez noncea, pa landing nema inline
    skripti. S3 provjerava zaglavlja `curl -I` na stagingu.
14. **Javni repo:** nikakvi e-mailovi, imena logopeda ni testera, lozinka staginga, linkovi
    pozivnica, ni u kodu, ni u tekstovima, ni na snimkama zaslona. Kontakt adresa na landingu je
    otvoreno pitanje za vrata S6. Do tada je CTA „Prijava” na `/admin/login`.
15. **Snimke zaslona** se rade sa staginga (stvarni katalog) skriptom, a svaka se prije commita
    pregleda na osobne podatke. Spremaju se kao `.webp` u `public/landing/`.
16. **Jedina vrata su u S6:** pregled staginga, odgovori na otvorena pitanja i „go” za produkciju.
    S1–S5 rade autonomno, ali `npm run deploy` (produkcija) i `db:migrate` (produkcija) u njima
    nisu dopušteni.
17. **Provjera:** `npm test && npm run check && npm run build` prije svakog commita, a od S3 i
    `scripts/landing-provjera.sh staging.logomedo.com`.
18. **Lanac radi u zasebnom worktreeju** `/Users/ms/git/logomedo/logomedo.com-landing` na grani
    `landing` (zamjenjuje dio odluka 2 i 3 o tome gdje se radi). Razlog: u
    `/Users/ms/git/logomedo/logomedo.com` paralelno radi neovisna sesija na adminu (`main`);
    prebacivanje grana ili necommitane izmjene u istoj radnoj kopiji bi joj smetale. S1 commita na
    `landing` i na kraju objavi staging u `main` s `git fetch && git rebase origin/main && git push
    origin HEAD:main` (fast-forward), pa pusha i `landing`. S2–S5 pushaju samo `landing`. S6 nakon
    „go” isto tako (`git push origin HEAD:main`). Glavna radna kopija se iz lanca nikad ne dira.
