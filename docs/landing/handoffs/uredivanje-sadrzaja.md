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
