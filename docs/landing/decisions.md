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

## S1 (19. 11. 2026.)

100. **Staging build u `dist-staging/`** (`npm run build:staging`, `scripts/staging-build.sh`), deploy
     s `--config dist-staging/server/wrangler.json`. `@cloudflare/vite-plugin` pri svakom buildu
     prepiše `.wrangler/deploy/config.json`, pa ga skripta vraća na `dist/server`; staging naredbe
     uvijek imaju `--config wrangler.jsonc --env staging`. Razlog: paralelni `npm run deploy` ili
     `npm run db:migrate` ne smiju pokupiti staging. Revizija: ako plugin dobije opciju za redirect.
101. **Razlika `definedEnvironments: ["staging"]` u produkcijskom `dist/server/wrangler.json` je
     prihvaćena** (potvrditi). Jedini učinak: produkcijski deploy doda Workeru tag
     `cf:service=logomedo` (grupiranje u dashboardu) i ispiše upozorenje o okruženjima. Kod, bindingi,
     rute i `vars` su isti (research `2026-11-19-astro-cloudflare-okruzenja.md`). Revizija: ako S6
     nakon deploya vidi bilo koju drugu promjenu.
102. **Zaštita staginga je u `src/worker.ts`** (omotač `stagingVrata` iz `src/lib/staging.ts`), ne u
     `src/middleware.ts`: tako pokriva i statičke datoteke (`assets.run_worker_first: true` samo u
     `env.staging`) i `/api/runner/zvono`. Usporedba lozinke: SHA-256 obiju strana pa XOR (radi i u
     `node --test`). Izuzeci `/api/v1*` i `/api/runner/*` se provjeravaju na dekodiranoj putanji bez
     `..` i `//`. Produkcija bez `OKRUZENJE` vraća točno odgovor iz `ulaz()`.
103. **`OKRUZENJE` i `STAGING_LOZINKA` su opcionalni u `src/env.d.ts`**, a `wrangler types` se nije
     pokretao (potvrditi): s `env.staging` bi generirani tipovi `vars` postali unije i promijenili
     `worker-configuration.d.ts` bez koristi. Worker ih čita iz `env` iz `cloudflare:workers`.
104. **Kopija produkcije: shema iz migracija + `export --no-schema`.** Puni dump se ne može
     importati (redoslijed tablica, D1 import u dijelovima, samoreference), pa
     `src/lib/staging-dump.ts` slaže naredbe roditelj → dijete i samoreference upisuje `UPDATE`-om.
     Export blokira produkcijsku D1 4–7 s. Revizija: ako Cloudflare doda export bez blokiranja ili
     import iz Time Travel kopije.
105. **Superadmin na stagingu je zaseban secret `ADMIN_EMAILS` staginga** (potvrditi), postavlja ga
     `scripts/staging-sesija.sh <email> --superadmin` (prepiše popis jednim e-mailom). U S1 postavljen
     na e-mail korisnika za e2e. Logopedi iz kopije `korisnici` rade sa sesijom bez toga.
106. **S1 je rađen u glavnoj sesiji bez subagenata** (iznimka od pravila orkestracije): paket je bio
     niz ovisnih infrastrukturnih koraka (resursi → konfiguracija → deploy → podaci → e2e), a kod
     je bio mali (dvije datoteke s testovima). S2–S5 se vraćaju na pravilo.

## S2 (19. 11. 2026.)

Inventura: `research/2026-11-19-inventura.md`. Sadržaj: `sadrzaj.md` (prijedlozi odluka u njegovom
odjeljku 6 su ovdje prihvaćeni).

200. **Stranice** (zamjenjuje prijedlog u odluci 11): `/`, `/katalog`, `/radni-listici`, `/igre`, `/o-nama`,
     `/privatnost` i 404. **Bez `/aplikacija`** (auto, potvrditi): Flutter aplikacija je samo za superadmina
     i nije u trgovinama (I-APP), pa je na naslovnoj samo „Aplikacija za tablet i mobitel: uskoro”.
     Sitemap: šest stranica; `robots.txt` zabranjuje `/admin`, `/api`, `/b`. Revizija: kad aplikacija izađe.
201. **Navigacija:** zaglavlje Katalog · Radni listići · Igre · O nama + gumb „Prijava” (`/admin/login`);
     na mobitelu `<details>` bez skripte (CSP, odluka 13); Privatnost samo u podnožju.
202. **Brojke su zaokružene konstante na jednom mjestu u kodu** (30 glasova, 650+ riječi, 1300+ slika,
     2 stila, 11 vrsta, 90 znakova, 2 teme). S6 ponavlja upite iz inventure na produkciji prije objave.
203. **Slušne vrste** („Koje slovo čuješ?”, „Gdje je glas?”) broje se među 11 vrsta jer rade na papiru; za
     igru piše „uskoro” (0 snimki glasova). **Izgovor** samo kao „upute i odabrane riječi”, nikad „svaka riječ”.
204. **Izostavlja se:** „AI” i nazivi servisa, praćenje napretka djeteta, aplikacija u trgovinama,
     registracija bez pozivnice, cijena, brojevi tjednog limita, upute za vježbenice. Alfa se na stranicama
     zove „probno razdoblje”; logopedu se obraća s „vi”.
205. **Demo je uvjetna sekcija** (G-6, „Isprobaj igru” na `/b/<demo>`) s rezervom bez demoa (G-6R, snimke).
     Kod ima konstantu `DEMO_URL`; prazna = rezerva. Demo bilježnica na produkciji je pitanje vrata S6
     (pisanje u produkcijsku D1); na stagingu se za snimke smije napraviti.
206. **Placeholderi** `[KONTAKT — S6]`, `[IME TVRTKE — S6]`, `[DEMO — S6]`, `[GODINA — S6]` su u kodu
     konstante; prazna konstanta uklanja element. Do odgovora u S6 je jedini CTA „Prijava” (odluka 14).
     Provjera S6: `grep -r "— S6]" dist/` prazan.
207. **Staging bez Basic Autha** (korisnik, 19. 11. 2026.; zamjenjuje odluku 7 i dio odluke 102). Javni dio
     staginga je otvoren kao produkcija („landing je public facing”); `/admin` štiti isti middleware kao na
     produkciji, `/api/v1` i `/api/runner/*` vlastiti bearer. `src/lib/staging.ts` samo dodaje
     `x-robots-tag: noindex` (i statičkim datotekama). Secret `STAGING_LOZINKA` se ne čita. Provjereno
     `curl`om nakon deploya `c32052c9`: `/` 200, `/admin` 302 na prijavu, `/api/v1/ja` 401, sve noindex.
     Kopija produkcijske D1 na stagingu je time izložena jednako kao produkcija (iza iste prijave).
208. **Access na stagingu zasad ne** (korisnik, b). Admin na stagingu ostaje na sesiji iz
     `scripts/staging-sesija.sh`; korisnik će Access aplikaciju za `staging.logomedo.com/admin/sso` dodati u
     dashboardu i poslati AUD tag (upute u `docs/staging.md`, „Access kasnije”), pa ga sesija upiše u
     `env.staging.vars.ACCESS_AUD` i deploya staging.
209. **Snimke se rade kao logoped** (sesija bez `--superadmin`), uz CSS koji sakrije `.tko` i ostale
     selektore iz `sadrzaj.md` odjeljak 4; probne bilježnice na stagingu neutralnih naslova. Ilustracije su
     `.webp` 512/256 px u `public/landing/`, preuzete jednom s `cdn.logomedo.com`; **OG slika je PNG
     1200 × 630** (pregledi linkova).
210. **Privatnost bez pravnih obećanja;** P-5 (voditelj obrade) se objavljuje tek nakon odgovora u S6.
211. **Godina starog LogoMeda i opis „zbirka bojanki”** u O-2 su iz privatnog `preuzimanje/`, ne iz
     inventure, pa su placeholder `[GODINA — S6]` do potvrde (iznimka od pravila reference, potvrditi).
212. **S2 je rađen s dva Opus subagenta** (inventura, tekstovi; `effort: medium`), jedan za drugim; izmjenu
     staginga (207) je napravila glavna sesija jer je bila mala i tražena usred paketa.
