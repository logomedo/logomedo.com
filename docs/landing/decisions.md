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

## S3 (19. 11. 2026.)

Provjera staginga: `research/2026-11-19-provjera-staging-s3.md` (89 OK, 0 grešaka, verzija `607dd115`).

300. **`build: { format: "file" }`** u `astro.config.mjs`: stranice su `katalog.html`, URL `/katalog` bez kose
     crte (kanonski), a `/katalog/` preusmjerava na `/katalog`. S `index.html` po direktoriju Cloudflare bi
     preusmjeravao obrnuto. Popis datoteka u `dist/server` je isti. Rizik (SSR rewrite bez kose crte) provjeren
     na stagingu: logoped na `/admin/prompt` dobiva 403 s pravom stranicom „Nemaš pristup · LogoMedo admin”.
301. **`public/_headers`: sigurnosna zaglavlja na `/*`, `Cache-Control: no-cache` samo na šest HTML putanja.**
     Cloudflare spaja istoimena zaglavlja iz više pravila zarezom, a adapter dopisuje `/_astro/*` s immutable
     cache-controlom. Popis putanja mora pratiti `STRANICE` u `src/landing/konstante.ts` (test to provjerava).
     SSR odgovori `_headers` ne dobivaju; `/admin/login` ima samo CSP s nonceom (provjera: `default-src` ×1).
302. **Tema na landingu je vanjski `/tema.js`** (prop `vanjskaSkripta` u `Tema.astro`), jer CSP iz `_headers`
     nema nonce. Admin dobiva isti HTML kao prije (inline + nonce iz middlewarea).
303. **Prazan `KONTAKT` uklanja i rečenice koje upućuju na kontakt** (N-1 „Nemate je? Zatražite pristup.”, N-6
     „Ako želite … javite nam se.”), ne samo gumb (potvrditi): tekst ne smije obećavati nešto čega nema.
     Redak „© …” se prikazuje tek kad su popunjeni i `GODINA` i `IME_TVRTKE`.
304. **`DATUM_OBJAVE` je peti placeholder S6** (P-1 „Stanje na dan …”), po pravilu odluke 206 (potvrditi).
     Placeholderi su prazne konstante, pa S6 umjesto `grep "— S6]" dist/` provjerava konstante u
     `src/landing/konstante.ts`.
305. **Podstranice su u S3 kosturi** (samo hero K-1, R-1, G-1, O-1, P-1 i CTA, pravi title i description)
     (potvrditi): zaglavlje i sitemap na njih upućuju, pa moraju vratiti 200. S4 i S5 ih dovršavaju. Stupci N-2
     su zasad bez snimki (V-2…V-4 nastaju u S4).
306. **www → apex za prerenderirane stranice ne radi na produkciji** (potvrditi u S6): statičke datoteke idu
     mimo Workera, pa `www.logomedo.com/` vraća landing umjesto 301 (prije je naslovna bila SSR). `canonical`
     pokriva SEO. S6 bira: Redirect Rule u Cloudflare dashboardu (preporuka, bez koda) ili `run_worker_first`
     za HTML putanje.
307. **Landing uvozi i kurziv Fraunces** (`wght-italic.css`), jer `Tema.astro` uvozi samo uspravni rez i
     „Listić za tren.” bi bio umjetno nakošen.
308. **S3: jedan Opus subagent za implementaciju** (`effort: high`); deploy staginga, provjera i rewrite
     `nemas-pristup` u glavnoj sesiji.

## S4 (19. 11. 2026.)

Snimke: `research/2026-11-19-snimke.md` (32 snimke, svaka pregledana). Staging verzija `a6d86944`,
`scripts/landing-provjera.sh staging.logomedo.com` 118 OK, 0 grešaka.

400. **`playwright-core` 1.65.1 kao točna devDependency, browser je sustavni Google Chrome** (`channel: "chrome"`),
     bez preuzimanja browsera. `npm run landing:snimke [V-…]`; `--pripremi` kroz admin forme napravi probne podatke.
401. **Logoped za snimke je aktivni korisnik iz staging `korisnici` s ulogom „logoped”**, a ne prvi redak: prvi je na
     stagingu superadmin (`/admin/prompt` 200; secret `ADMIN_EMAILS` staginga je korisnikov e-mail, odluka 105). Provjera
     403 je obavezna prije snimanja. E-mail, kolačić, ID-jevi i slugovi samo u `~/.cache/logomedo-staging/`
     (`probni.json`, `kolacic`). S4 je to krivo pretpostavio iz handoffa S3.
402. **Imena snimki** `public/landing/v<N>-<desktop|mobitel>[-tamna].webp`; desktop 1280×800 @1x, mobitel 390×844 @2x
     (780×1688), samo viewport (V-23 naslovnica smanjena u 1280×800); `cwebp -q 80`. Alt i varijante su u `SNIMKE` u
     `src/landing/konstante.ts`; test provjerava postojanje i dimenzije.
403. **Na snimkama nema ni AI-ja ni limita** (odluka 204 vrijedi i za slike): sakriveni su blok „Preostalo (7 dana)”,
     izgovor i „Generiraj zvukove”, panel izgovora na bilježnici, „Prompt”, „model …” u podnaslovu kataloga i brojke
     „u redu za generiranje”. Skripta odbija snimku s e-mailom, slugom ili riječima AI, prompt, ElevenLabs, Vertex,
     Gemini, STT, „Preostalo” (potvrditi).
404. **Slike riječi na admin snimkama dolaze s `cdn.logomedo.com`**, jer je privatni R2 staginga prazan; ključeve
     odobrenih slika skripta čita jednim SELECT-om iz staging D1. To su iste slike kao na produkciji.
405. **Admin na mobitelu ima dva CSS propusta i na produkciji**: globalni `.skupina` iz `AdminOkvir.astro` i
     `main.sadrzaj` bez `min-width: 0` (A4 list izlazi iz ekrana). Snimke ih zaobilaze CSS-om. Popravak je izvan lanca
     (admin se ne dira); zapisano za S6 kao nalaz (potvrditi).
406. **Probni podaci na stagingu** (listići, zadaci, scena, javna „Zimska” i „Proljetna bilježnica”, jedna učitana slika
     za pregled) nestaju sa `scripts/staging-osvjezi.sh`; nakon osvježavanja ponovno `--pripremi`. V-4, V-20–V-24
     (igre, S5) su već snimljeni.
407. **R-4 bez slike**, jer je V-14 već hero iste stranice; **N-3 bez V-13** (nije bio u opsegu) (potvrditi).
408. **Ograničenja proizvoda** („do 150 slika”, „12–15”, „4 do 12”, „5 mm”) su tekst, ne `BROJKE`: `BROJKE` drži samo
     brojke kataloga koje S6 provjerava na produkciji.
409. **Tamna varijanta snimke je CSS** (obje `<picture>` u HTML-u, `data-tema` i `prefers-color-scheme`); svijetla
     hero snimka se učitava odmah, pa posjetitelj s tamnom temom preuzme jednu sliku više (prihvaćeno).
410. **Alt V-16** je „Kolo sa slovima stalo je na glasu; zatim dijete među slikama traži one koje počinju tim
     glasom.” (snimka pokazuje zaustavljeno kolo; `sadrzaj.md` usklađen).
411. **S4: dva Opus subagenta paralelno** (snimke; stranice), `effort: high`; pregled snimki, deploy i provjera u glavnoj
     sesiji. Pregled je vratio snimke jednom (odluka 403).

## S5 (19. 11. 2026.)

Provjera staginga: `research/2026-11-19-provjera-staging-s5.md` (130 OK, 0 grešaka, verzija `b46a6a21`).

500. **S5 je rađen u glavnoj sesiji bez subagenata** (iznimka od pravila orkestracije, kao odluka 106): tekstovi su bili
     gotovi u `sadrzaj.md`, snimke iz S4, a kod su tri stranice od malih sekcija po uzoru na `katalog/`. Provjera
     (testovi, deploy, `landing-provjera.sh`, vizualni pregled 1280 / 360 px / tamna) je odvojen korak nakon commita.
501. **V-21 je snimka samo za mobitel** (`samoMobitel` u `SNIMKE`): `snimkaDatoteke` vraća `desktop: undefined`, a
     `Snimka.astro` je prikazuje uvijek usku (`.uspravna`, 300 px, bez trake prozora). Test provjerava datoteku i 780×1688.
502. **Raspored `/igre`** (potvrditi): G-1 V-20 (hero), G-2 V-22 („Bravo!” uz naslov „Kreni, riješi, Bravo!”), G-3
     V-21 (Proljeće; Božić je već u heroju), G-7 V-24, a **G-6/G-6R su zadnji**, da stranica završi pozivom. Rezerva
     G-6R ima **jednu snimku V-4** umjesto galerije V-20…V-22, jer bi galerija ponovila tri snimke s iste stranice.
     Bez `KONTAKT` u G-6R otpada rečenica „zatražite pristup” (odluka 303).
503. **P-5 ima vlastiti placeholder `VODITELJ_OBRADE`** (potvrditi) i prikazuje se samo kad su popunjeni on i `KONTAKT`.
     `IME_TVRTKE` u podnožju još nije pravna izjava o voditelju obrade (odluka 210), pa ga P-5 ne preuzima sam.
504. **O-2 bez `GODINA`** ima naslov „Stari i novi LogoMedo” i samo rečenicu o preuzetom katalogu; s godinom naslov
     „Od bojanki do igre” i rečenica o bojankama (odluka 211). „Više od dvjesto novih riječi” (234) i „deset novih
     vrsta” (11 − listić) su tekst, ne `BROJKE` (kao odluka 408); S6 ih provjerava uz brojke iz inventure (potvrditi).
505. **P-4 je provjeren na shemi i kodu**, i dopunjen s dvije istinite stavke koje u `sadrzaj.md` nije bilo:
     passkey se sprema samo kao javni ključ s oznakom koju logoped upiše (`admin_passkeys.public_key`, `label`), a uz
     sesiju se pamti preglednik (`admin_sessions.user_agent`). Sesija 12 h / 2 h neaktivnosti
     (`src/lib/admin/sesija.ts`), kvota 7 dana (`src/lib/kvota.ts`), PDF u pregledniku (`src/lib/pdf/preglednik.ts`).
     Rečenica „otisak i lice ne napuštaju uređaj” (OP-10) i dalje nije dodana.
506. **`DEMO_URL` ostaje prazan** i na stagingu: konstanta je ista za oba builda, a slug probne bilježnice sa staginga
     ne smije u javni repo (odluka 401). G-6 je napisan i provjeren buildom; uključuje ga S6 s produkcijskom demo
     bilježnicom (koraci na vrhu `S6.md`).
507. **404 je ostala iz S3** (rečenica o linku na igru za sve, OP-9 po preporuci). `landing-provjera.sh` sada za svaku
     stranicu provjerava i da nema placeholdera „— S6]”.
508. **Privatnost ne navodi obrađivače** (hosting, servisi za slike i izgovor), jer odluka 204 zabranjuje nazive
     servisa na landingu; je li to pravno dovoljno, pitanje je vrata S6 (vrh `S6.md`).

## S6 (19. 11. 2026.)

Pravni tekstovi napisani autonomno po korisnikovoj ovlasti od 19. 11. 2026. (ITalk d.o.o. je pravna osoba iza LogoMeda;
izvori: ITalk politike u `../../italk/italk-hr/src/content/legal/hr/` i `domovina.ai/docs/compliance/`, samo čitanje).
Lighthouse: `research/2026-11-19-lighthouse.md`. Staging `05029b71`, provjera 141 OK, 0 grešaka.

600. **Voditelj obrade i pružatelj je ITalk d.o.o. za informacijske tehnologije** (OIB 54872935051, MBS 081042440,
     Trgovački sud u Zagrebu, IX. Južna obala 20, Zagreb): `TVRTKA` u `src/landing/konstante.ts`. Javni podaci iz registra
     smiju u javni repo; telefon i osobni e-mailovi ne (test). `VODITELJ_OBRADE = TVRTKA.naziv`, `IME_TVRTKE = "ITalk d.o.o."`,
     `GODINA = "2026"` (podnožje). Pitanja o podacima idu na `privacy@italk.hr` (vrata 2 iz S5: riješeno).
601. **`GODINA_PRVOG = "2017"`** je odvojena od godine u podnožju (jedna konstanta je radila oboje). Izvor: najstariji listići
     u izvozu starog appa su iz 2017., i to su bojanke (`../preuzimanje/docs/legacy-data-stats.txt`, `legacy-app.md`).
     O-2 zato ima naslov „Od bojanki do igre”. Brojke iz odluke 504 provjerene na produkciji (samo SELECT): 659 aktivnih
     riječi, od toga 234 dodane (`izvor='admin'`) → „više od dvjesto”; 11 vrsta u `src/lib/zadaci/vrste.ts` → „deset novih”
     uz listić. Ostale `BROJKE` iste: 30 glasova, 659 → 650+, 1320 odobrenih slika → 1300+, 2 stila, 90 znakova; produkcija
     ima zadnju migraciju `0037_slike_predlozio.sql` kao repo.
602. **`KONTAKT = "mailto:hello@italk.hr"`** (javna opća adresa tvrtke; odgovor orkestratora „a”, auto, potvrditi). Uključuje
     „Zatraži pristup”, „Kontakt:” i rečenice „javite se”. S7 ga zamjenjuje obrascem.
603. **`/privatnost` je sad politika privatnosti po GDPR-u**: zadržan je kratki konkretni dio (P-1…P-4, dopunjen zapisima
     hostinga i aplikacijom za mobitel: naziv uređaja, 30 / 7 dana), a dodani su P-5 voditelj (uvijek), P-6 osnove (čl. 6.
     t. b i f, bez privole i marketinga), P-7 obrađivači, P-8 kolačići, P-9 rokovi, P-10 prava i AZOP.
604. **Obrađivači su imenovani na `/privatnost`** (vrata 3 iz S5: b): Cloudflare, Google Cloud (Vertex AI), ElevenLabs, Google
     Workspace (e-pošta), prema kodu. Odluka 204 se mijenja samo za tu stranicu. Prijenos izvan EU: Okvir EU-SAD gdje je
     pružatelj certificiran, inače standardne ugovorne klauzule (potvrditi ugovore o obradi s korisnikom).
605. **Kolačići**: landing i igra bez kolačića; nakon prijave kolačić sesije i dva kolačića postavki kataloga (365 dana),
     localStorage teme, trake i podjele predložaka. Svi nužni ili postavke, pa nema bannera ni privole (čl. 5(3) ePrivacy).
     Zasebna politika kolačića nije potrebna; sekcija je na `/privatnost#kolacici`.
606. **Brisanje računa na zahtjev** (vrata 4 iz S5: b): „pišite na privacy@italk.hr, brišemo najkasnije u 30 dana; u povijesti
     izmjena kataloga umjesto e-maila ostaje oznaka bez osobnih podataka”. U aplikaciji tog postupka nema: radi se ručno u D1
     (superadmin). Runbook za brisanje (koje tablice, zamjena `aktivnost.tko`) je posao nakon objave (potvrditi).
607. **Nova stranica `/uvjeti`** (Uvjeti korištenja i podaci o pružatelju po Zakonu o elektroničkoj trgovini čl. 6.): u
     `STRANICE` (sitemap 7 URL-ova, `landing-provjera.sh` očekuje 7), link u podnožju, `Cache-Control` u `_headers`. Sadržaj:
     pristup uz pozivnicu, probno razdoblje (bez cijene, odluka 204; naplata samo uz pristanak), katalog pripada pružatelju
     (korištenje u radu, bez preprodaje i učenja modela), zadaci i bilježnice ostaju logopedovi, nove slike za riječi idu u
     zajednički katalog, odgovornost samo za namjeru i krajnju nepažnju, pravo RH, sud u Zagrebu uz iznimku za potrošače.
     Impressum kao zasebna stranica nije potreban (pružatelj je na vrhu `/uvjeti`).
608. **Aktivna stranica u zaglavlju** (zahtjev korisnika u S6): `aria-current="page"` je postojao samo s tankom crtom; sad ima
     pozadinu `--med-blago` i crtu, u mobilnom izborniku lijevu crtu. Podnožje dobiva `putanja` i ističe i Privatnost i Uvjete.
609. **Prekidač teme** (zahtjev korisnika u S6): gumb u zaglavlju (≥ 720 px), u mobilnom izborniku redak „Tamna tema”, jer bi
     četvrti element u zaglavlju na 360 px izlazio iz ekrana. Logika u `public/tema.js` (već se učitava u `<head>` prije
     crtanja, pa nema bljeska i CSP ostaje `script-src 'self'`); isti ključ `logomedo-tema` kao admin; `aria-pressed` = tamna.
610. **Lighthouse**: kontrast gumba u `Sekcija` popravljen (`a:not(.gumb)`); SEO `is-crawlable` na stagingu je namjeran
     (odluka 207); `image-aspect-ratio` na `/katalog` mobitel je ograničenje audita za `<picture><source width height>`,
     ostavljeno.
611. **Obrazac „Zatraži pristup” je paket S7** (zahtjev korisnika u S6): javni POST, nova tablica i migracija, zaštita od
     spama, admin ekran za odobravanje koji stvara postojeću pozivnicu, izmjena `/privatnost`. To je izmjena `src/lib/admin`,
     middlewarea i sheme, dakle izvan opsega S6 („admin, API i `src/lib/` se ne mijenjaju”) i veće od jedne sesije uz
     pregled i vrata. S6 staje na vratima kao do sada; S7 radi na grani `landing` i stagingu, produkcija tek uz isti „go”.
612. **`DATUM_OBJAVE = "19. 11. 2026."`** na `/privatnost` i `/uvjeti` (datum teksta). Nakon „go” postaviti na datum objave
     ako je kasniji.
613. **`/code-review high` grane `landing` naspram `main`** (6 nalaza): popravljeni test prekidača teme (klasa
     `prekidac-teme gore`), `staging-osvjezi.sh` koji je brisao `d1_migrations` staginga i uvozio produkcijske (S7 dodaje
     migraciju 0038, pa bi sljedeći `db:migrate:staging` pao), `straniKljucevi()` koji nije vidio strani ključ iza
     `-- komentara`, i zaostali tip `STAGING_LOZINKA`. Commit `d70adf8`.
614. **www → apex za prerenderirane stranice** (nalaz reviewa) je poznat od odluke 306: ostaje pitanje vrata (Redirect Rule
     u dashboardu, preporuka), jer je to vanjska radnja na produkcijskoj zoni.
615. **E-mailovi tvrtke u javnom repou** (nalaz reviewa: pravilo „nikakav e-mail” u `../CLAUDE.md`): `privacy@italk.hr`
     korisnik je izričito odobrio 19. 11. 2026. (javni podaci tvrtke), `hello@italk.hr` je javna adresa s italk.hr
     (odluka 602, potvrditi). Iznimka zapisana u `../CLAUDE.md`: javne adrese tvrtke smiju, osobne i dalje ne.
616. **Natpis prekidača teme prati stanje** (ispravak korisnika u S6): gumb kaže u koju temu prebacuje, kao i ikona: u svijetloj
     mjesec i „Tamna tema”, u tamnoj sunce i „Svijetla tema”. U mobilnom izborniku oba natpisa su u HTML-u u `.samo-dan` /
     `.samo-noc` (CSS, bez bljeska i bez skripte); na desktopu `/tema.js` postavlja `aria-label` i `title`, i na promjenu teme
     sustava. `aria-pressed` je uklonjen, jer uz natpis koji opisuje radnju zbunjuje čitač zaslona.

## S7 (19. 11. 2026.)

700. **`/pristup` je SSR** (`prerender = false`), jer obrađuje POST i nosi vremenski žig; u sitemapu je, u glavnom izborniku
     nije. CSRF iz middlewarea vrijedi samo za `/admin`, pa `/pristup` sam traži `Origin` = svoj origin (inače 403).
     `Cache-Control: no-store`. Bez JavaScripta i bez inline skripte (CSP iz `zastiti()`).
701. **Zaštita od spama bez vanjske skripte:** skriveno polje `web_stranica`, vrijeme ispunjavanja 3 s – 24 h, najviše 3
     upisana zahtjeva na sat po `ip_hash`, jedan otvoreni zahtjev po e-mailu. **Turnstile nije uveden** (traži CSP iznimku
     za `challenges.cloudflare.com` i vanjsku skriptu; uvesti tek ako spam prođe ove zaštite).
702. **`PRISTUP_TAJNA` (secret)**: kad postoji, vremenski žig je potpisan (HMAC-SHA256) i ulazi u hash IP adrese; bez njega
     žig je goli broj i hash IPv4 se može izračunati unatrag. Postavljen na stagingu (slučajna vrijednost, nigdje zapisana);
     **na produkciji postaviti prije deploya** (`openssl rand -base64 32 | wrangler secret put PRISTUP_TAJNA`), korak nakon „go”.
703. **Odgovori:** skriveno polje, prebrz žig i ponovljeni e-mail tiho dobiju isti „Hvala” (303, ništa se ne upisuje, ne otkriva
     postoji li zahtjev ili račun); prazan ili neispravan obrazac i obrazac stariji od 24 h dobiju 400 s porukom i upisanim
     podacima (čovjek mora znati da nije poslano); preko limita 429. Nakon greške ostaje stari žig.
704. **Retencija** (brisanje pri upisu i pri otvaranju `/admin/zahtjevi`, bez crona): `novi` i `odbijen` 6 mjeseci od upisa,
     `odobren` kad je pozivnica iskorištena ili 6 mjeseci od odobrenja; `ip_hash` se briše nakon 24 h. Brojevi su u
     `src/lib/pristup-rokovi.ts` i isti se ispisuju na `/privatnost`.
705. **Zahtjevi ne idu u `aktivnost`** (CHECK na `tablica` ih ne poznaje, a pregradnja tablice nije vrijedna toga): trag je
     `obradio`/`obradjen_at`; izdaj() ionako bilježi `poziv.izdan`.
706. **„Odobri” prvo zaključa zahtjev** (`UPDATE … WHERE status = 'novi'`), pa izda pozivnicu; ako izdaj() odbije (npr. već
     aktivan logoped), zahtjev se vraća u `novi` s porukom. Dvostruki klik: drugi dobije 400 „već obrađen” (provjereno na
     stagingu). Prekid točno između zaključavanja i izdavanja ostavlja `odobren` bez pozivnice: pozivnica se tada izda ručno.
     Link pozivnice prikazuje se samo u tom odgovoru (token u fragmentu, kao `/admin/poziv`).
707. **Ustanova i grad su obavezni u obrascu, poruka nije**; u bazi su stupci NULL, da se to može promijeniti bez migracije.
708. **Kvačica je potvrda upoznatosti, ne privola** („Upoznat/a sam s tim kako LogoMedo koristi i čuva ove podatke”), jer je
     osnova čl. 6. st. 1. t. (b) GDPR-a; stupac se ipak zove `privola_at` kako je tražio paket.
709. **Svi „Zatraži pristup” vode na `/pristup`** (konstanta `PRISTUP`): CTA, podnožje, hero, N-6, G-6R, O-3.
710. **Obavijest superadminu e-poštom o novom zahtjevu nije u S7** (prijedlog za kasnije): traži Cloudflare Email Service i
     postavljanje domene za slanje (vanjska radnja). Do tada brojač u bočnoj traci superadmina.
711. **Kontakt na landingu je `bok@logomedo.com`** (odluka korisnika u S7, kroz orkestratora): i `KONTAKT` i adresa u bloku
     voditelja obrade na `/privatnost`; voditelj ostaje ITalk d.o.o. s OIB-om i adresom. `hello@italk.hr` i `privacy@italk.hr`
     više nisu na landingu (`grep -rn "italk.hr" src public` prazan). Mijenja odluke 602 i 615. Pošta za logomedo.com ide kroz
     Google (MX), korisnik je potvrdio da radi; Cloudflare Email Routing u zoni nije uključen i ne treba (uključivanje bi
     zamijenilo MX). Na `/uvjeti` jedan redak „Kontakt (i za osobne podatke)”. Iznimku o javnim adresama u `../CLAUDE.md`
     (spominje italk.hr adrese) treba uskladiti: nije mijenjana iz ove sesije (potvrditi, orkestrator/korisnik).
712. **www → apex**: Redirect Rule u dashboardu dodaje korisnik (odgovor na pitanje 4 u `S6.md`); nakon „go” samo
     `curl -I https://www.logomedo.com/` → 301.

## S6, objava (19. 11. 2026.)

617. **Objava po „go”** (korisnik, 19. 11. 2026.: „ok, go … ajde neka sve ide na logomedo.com”). `origin/main` (`642099d`)
     bio je predak `landing`, pa rebase nije trebao; `npm test` 329/329, check 0 grešaka, build prolazi. Redoslijed:
     `npm run db:migrate` (samo 0038, `CREATE`), `openssl rand -base64 32 | wrangler secret put PRISTUP_TAJNA` (Worker
     `logomedo`, top-level env), `npm run deploy` iz čistog stabla (verzija `d6005500`, zadnja u `wrangler deployments
     list`), `git push origin HEAD:main` (`642099d..e11741f`, fast-forward).
618. **Prva provjera nakon deploya nije mjerodavna.** Prvi `landing-provjera.sh logomedo.com` dao je 12/12, drugi 21/3
     (prolazni 404 na `/pristup`, `/sitemap.xml` dok se nova verzija širi po rubu), treći 157 OK, 0 grešaka. Isto kao na
     stagingu u S7 (149/1). Pravilo: nakon deploya pričekati pola minute ili ponoviti provjeru prije zaključka.
619. **www → apex radi:** `curl -I https://www.logomedo.com/` → `301`, `location: https://logomedo.com/` (Redirect Rule
     korisnika, odluka 712). Nije otvorena stavka.
620. **Demo bilježnica nije u prvoj objavi** (korisnik): `DEMO_URL` ostaje prazan, vrijedi G-6R. Superadmin je složi kasnije
     sam (prijava passkeyem); tada `DEMO_URL`, build, deploy.
621. **Pravni tekstovi prihvaćeni kakvi jesu** (korisnik). Potvrda prihvaćenih DPA-ova (Cloudflare, Google, ElevenLabs,
     odluka 604) ostaje korisnikov korak, otvorena stavka u `TODO.md`.
622. **Provjere na produkciji samo bez prijave** (curl): `/admin` 302, `/admin/login` 200, `/api/v1/katalog` 401, javna
     `/b/<slug>` 200 (slug iz `SELECT`, ne zapisuje se), `/b/nepostoji-xyz` 404, `x-robots-tag` i `meta robots` na
     produkciji nema. Probni zahtjev kroz obrazac i „Odbij” ostavljeni korisniku (pisanje u produkcijsku D1 i prijava).
623. **Lighthouse na produkciji** (mobitel i desktop, 8 stranica): SEO 100 i accessibility 100 svuda; najniže
     performance 90 (`/katalog`, mobitel), best practices 96 (`/katalog`, mobitel). Brojke u `research/2026-11-19-lighthouse.md`.
624. **Lanac zatvoren.** Uređivanje sadržaja ide u novu sesiju bez lanca (`handoffs/uredivanje-sadrzaja.md`); grana
     `landing` ostaje na `e11741f`, nove izmjene idu na `main`.

## Poslije lanca

625. **Pozivnica e-poštom pri „Odobri”** (zahtjev korisnika 19. 11. 2026.; mijenja dio odluke 706 da se link vidi
     samo u odgovoru): Resend, domena `logomedo.com` u regiji eu-west-1, pošiljatelj `pozivnica@logomedo.com`,
     reply-to `bok@logomedo.com` (`src/lib/email.ts`). DNS samo na poddomenama (`resend._domainkey` TXT, `send` MX+TXT,
     `rsend` CNAME, DNS only), pa Googleov MX i SPF na apexu ostaju. Secret `RESEND_API_KEY` **samo u produkciji**:
     staging je kopija produkcijske D1 sa stvarnim adresama, pa bez ključa ne šalje ništa. Neuspjeh slanja ne vraća
     odobrenje: admin vidi upozorenje i link kao rezervu. Resend je odabran umjesto Cloudflare Email Servicea (odluka
     710) jer je korisnik već imao ključ; obavijest superadminu o novom zahtjevu sad može ići istim putem.

## Uređivanje sadržaja (od 800)

800. **Ljepše slike i bolje rime u prvom planu** (korisnik, 19. 11. 2026.): u V-1 (hero naslovne, N-4, OG slika)
     ŽIRAFA umjesto ŽABE i RUKAVICE umjesto RIBE (glasovi Ž i R ostaju); u „Dva stila” (V-8) par RUKAVICE umjesto RIBE.
     Ključevi: `ilustracija/zhirafa/a8f5bfc0c09f4158.png`, `ilustracija/rukavice/e672bb66109e13c6.png`,
     `bojanka/rukavice/f314aad932d163cb.png`; stare `riba-*`/`zaba-*` webp maknute. Zadatak „Rima” za snimke (Zimska
     bilježnica) više nije nasumičan iz predloška (bile su FRULA–BROKULA i SLOVA–SOVA): `RIME` u
     `scripts/landing-snimke.ts` (KAPA–ŠAPA, ČAJ–ZMAJ, SLON–BALON, CRKVA–MRKVA), `--rime` ih upiše u postojeći
     probni zadatak. V-4 tako pokazuje SLON–BALON, V-20 CRKVA–MRKVA. `sadrzaj.md` i dalje vrijedi i usklađen je.
