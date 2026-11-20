# Uređivanje sadržaja landinga (nova sesija, nakon lanca)

LogoMedo (logomedo.com) je web aplikacija za logopede (Astro 7 + Cloudflare Workers + D1 + R2). Lanac „landing”
(S0–S7) je završen 19. 11. 2026.: višestranični landing i obrazac „Zatraži pristup” su na produkciji. Korisnik je
pregledao strukturu i funkcionalnost; **ova sesija uređuje sadržaj** (tekstove, redoslijed sekcija, ilustracije,
snimke) po korisnikovim uputama u razgovoru. Nema lanca ni vrata: radi ono što korisnik traži.

## Gdje se radi

- Radna kopija: `/Users/ms/git/logomedo/logomedo.com` (grana `main`). Na početku `git -C … pull --ff-only`
  (`main` = `e11741f` ili noviji). Worktree `../logomedo.com-landing` (grana `landing`) je lanac i više se ne koristi.
- Pravila repoa: `CLAUDE.md`; paralelne sesije su moguće, pa commit poimence (nikad `git add -A`).
- Javni repo: nikakvi e-mailovi osim `bok@logomedo.com`, imena logopeda ili testera, tokeni ni slugovi korisničkih bilježnica.

## Gdje su tekstovi

| Što | Putanja |
| --- | --- |
| Izvorni tekst svih stranica (arhitektura, sekcije, vizuali, pravilo tvrdnji) | `docs/landing/sadrzaj.md` (odjeljak 3 po stranici, 4 vizuali) |
| Stranice (samo slaganje sekcija, `title`, `description`) | `src/pages/{index,katalog,radni-listici,igre,o-nama,privatnost,uvjeti,pristup,404}.astro` |
| Sekcije po stranici (tekst je ovdje) | `src/landing/<stranica>/*.astro` (`naslovna/`, `katalog/`, `radni-listici/`, `igre/`, `o-nama/`, `privatnost/`, `uvjeti/`) |
| Zajedničko: zaglavlje, podnožje, okvir, CTA, snimka | `src/landing/{Zaglavlje,Podnozje,Okvir,Cta,Poziv,Sekcija,Snimka,Uvod}.astro` |
| Konstante: `KONTAKT`, `IME_TVRTKE`, `TVRTKA`, `GODINA`, `DATUM_OBJAVE`, `DEMO_URL`, `STRANICE` (meni, sitemap) | `src/landing/konstante.ts` |
| Ilustracije i OG slika | `public/landing/` (iz kataloga, ne generirati nove bez pristanka) |
| Snimke zaslona | `scripts/landing-snimke.ts` (Playwright nad stagingom, bez osobnih podataka) |
| Odluke i razlozi | `docs/landing/decisions.md` (blokovi 1–17, 100–712); nove odluke od **800** |

Pravila sadržaja (iz lanca): svaka tvrdnja o funkciji mora biti istinita na produkciji (inventura
`docs/landing/research/2026-11-19-inventura.md`; što ne radi piše se kao „uskoro” ili se izostavlja, odluka 10);
bez naziva vanjskih servisa na landingu osim na `/privatnost` (odluka 204); `title` ≤ 60 i `description` ≤ 155
znakova (test). Ako se mijenja tekst, `sadrzaj.md` i kod drži usklađene (ili zapiši da je `sadrzaj.md` od sada
samo povijest, odluka 800).

## Provjera i objava

1. `npm test && npm run check && npm run build` (polazno: 329 testova, pass 329, skipped 0; check 0 grešaka).
   `src/landing/landing.test.ts` provjerava duljine meta-tekstova, stranice, sitemap, `_headers`, robots, placeholdere.
2. Staging (javan, `noindex`, kopija produkcijske D1): `npm run deploy:staging`, pa
   `scripts/landing-provjera.sh staging.logomedo.com` (polazno 157 OK, 0 grešaka). Korisniku link na staging za pregled.
3. Produkcija tek kad korisnik kaže: `npm run deploy` iz čistog stabla, pa `scripts/landing-provjera.sh logomedo.com`
   (prvi prolaz odmah nakon deploya zna dati prolazne 404, ponovi; odluka 618), push `main`.
   Vizualna provjera: Playwright nad `dist/client` (`python3 -m http.server`), 1280 / 360 px / tamna tema.
4. Lighthouse (naredba u `docs/landing/research/2026-11-19-lighthouse.md`): produkcija 19. 11. svuda SEO i a11y 100.

## Otvorene stavke (nisu dio ove sesije osim ako korisnik ne traži)

- Demo bilježnica (G-6): superadmin je složi na produkciji, slug u `DEMO_URL`, build, deploy (odluka 620).
- Potvrda DPA-ova s Cloudflareom, Googleom i ElevenLabsom (korisnik, odluka 621).
- Probni zahtjev kroz `/pristup` i „Odbij” u `/admin/zahtjevi` na produkciji (korisnik, prijava).
- Access AUD za staging (odluka 208); nalaz 405 (admin na mobitelu); obavijest e-poštom o zahtjevu (odluka 710).

## Iteracije 20. 11. 2026. (odluke 802–808, samo staging)

Na produkciji od 20. 11. navečer (produkcija `5b6522aa`, staging `8a3e3df9`, oba iz čistog worktreea na `0f71992`,
`landing-provjera.sh` 207/0 na oba; odluka 809 „Kako nastaje radni listić” u četiri kartice ispod hera je također tu): hero izmjenjuje slike istog slova (802, 803),
novi podnaslov i uvod + sekcija „Za sve koji rade s djecom” (`naslovna/ZaKoga.astro`, 804), 30 slova u N-4 su gumbi
sa slikom (805), h1 se nasumično mijenja na osvježavanje između četiri varijante (`H1_VARIJANTE`, `/?naslov=N`, 808).
Tijek po izmjeni: test + check → `npm run deploy:staging` → commit poimence → push.

Zamke:

- **Skripte na landingu:** CSP prerenderiranih stranica je `script-src 'self'` bez noncea. Astro `<script>` u komponenti
  mali kod ugradi inline (s nonceom iz middlewarea u vrijeme prerendera, beskoristan) i preglednik ga blokira. Zato je kod u
  `public/landing/*.js`, a tag mora imati još neki atribut (`defer`, `type="text/javascript"`), inače Astro build pukne
  („references an asset in the public/ directory”). Test zabranjuje `is:inline`.
- **Staging nakon deploya** zna 10–30 s vraćati staru naslovnu (`cf-cache-status: HIT` usprkos `no-cache`). Provjeri s
  `curl … | grep` dok se ne promijeni, a vizualno najbrže nad `dist-staging/client` (`python3 -m http.server <port> -d …`;
  na 4399 zna već slušati neki stari server).
- **Slike iz kataloga:** `scripts/landing-ilustracije.sh <novi-radni-dir> <ime…>`; ključeve daje D1 upit nad `slike`
  (status `odobrena`, stil `ilustracija`). Neki su JPEG pod `.png` (balon); skripta prima oba.
- `npm test` padne na `d1.test.ts` kad paralelna sesija ima necommitanu migraciju; to nije landing.
- **Produkcija i staging usklađeni:** deploy oba iz `git worktree add --detach <scratchpad>/wt origin/main` (symlink
  `node_modules`), jer `npm run deploy:staging` iz radne kopije pokupi i necommitani rad paralelne sesije.
