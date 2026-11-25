# Admin: Cloudflare Access (OTP) + passkey

Kod je iz `~/git/domovinatv/omm.domovina.ai` (`src/lib/admin/*`, `src/middleware.ts`,
`migrations/0005_admin.sql`), a tamo iz pay.domovina.ai. Sigurnosnu logiku držati u
skladu s njima.

- **E-mailovi admina nisu u repou** (repo je javan): `ADMIN_EMAILS` je secret.
  Promjena: `npx wrangler secret put ADMIN_EMAILS` (vrijednost „a@x,b@y”, bez razmaka),
  lokalno u `.dev.vars`. Isti popis ide u Access politiku, svaki e-mail kao zasebno pravilo.
- `/admin/sso` štiti Access aplikacija (One-time PIN na e-mail). Worker dodatno provjerava
  JWT (potpis, issuer, `ACCESS_AUD`) i `ADMIN_EMAILS`.
- Passkey se dodaje samo u sesiji otvorenoj Accessom unutar zadnjih 10 min. Najviše 5 po e-mailu.
- Sesija: kolačić `__Host-logomedo_admin`, u D1 samo sha-256 (`admin_sessions`). Traje 12 h,
  istječe nakon 2 h neaktivnosti.
- CSRF: svaki POST mora imati `Origin` jednak originu. CSP s nonceom.
- `/api/runner/*` ne koristi sesiju nego bearer `RUNNER_TOKEN` (secret).

## Produkcija (31. 10. 2026.)

Deployano na D.O.M. račun: Worker `logomedo` (custom domain `logomedo.com` i `www`, a www
ide 301 na apex), D1 `logomedo` (`e67d3840-…`, migrirano i seedano), R2 `logomedo-slike`,
secret `RUNNER_TOKEN` (lokalno u `.env.production`, gitignored; `scripts/runner.sh --prod`).
Access aplikacija „LogoMedo admin (sso)” (AUD 81d4dce3…). Politika treba biti vlastita „LogoMedo admini” (isti e-mailovi kao secret `ADMIN_EMAILS`), ne „OMM admini”.

**Zamka (31. 10. 2026.):** u politici svaki e-mail mora biti **zasebno** Include → Email pravilo.
Jedno pravilo s vrijednošću „a, b, c” Access uspoređuje doslovno kao jednu adresu, pa ne
propušta nikoga, a OTP se tiho ne šalje (Anitin kod „nije stizao”). Provjera:
`GET /accounts/<id>/access/policies/<id>` → `include` mora imati po jedan `{"email":{"email":…}}`. Deploy samo `npm run deploy` (build kopira wrangler.jsonc u dist).
**Zamka (31. 10. 2026.):** `wrangler d1 migrations apply logomedo --remote` je bez `CLOUDFLARE_ACCOUNT_ID` vratio 7403 („account is not valid”) iako je `account_id` u wrangler.jsonc. S `CLOUDFLARE_ACCOUNT_ID=7dc7167b7e2e00923bfa7cd697df14e4` prolazi; isto za `npm run deploy`. Od 8. 11. 2026. ga `npm run db:migrate` i `npm run deploy` postavljaju sami: tog je dana migracija 0024 tiho pala (izlaz kroz `| tail` sakrio je grešku), a deploy je prošao, pa je `/admin/zvukovi` oko minutu tražio stupac koji nije postojao. Migracija uvijek ide prije deploya, s provjerom izlaza.
Stari Firebase A zapisi za apex i www su obrisani; `stage.logomedo.com` je ostao na Firebaseu.

## Uloge i pozivnice (RBAC, 16. 11. 2026.)

Plan, odluke i povijest: [`docs/rbac/`](rbac/plan.md) (odluke u [`decisions.md`](rbac/decisions.md)).

| | superadmin | logoped |
|---|---|---|
| Tko je | e-mail u secretu `ADMIN_EMAILS` (ništa u bazi to ne mijenja) | redak u `korisnici` s `uloga='logoped'`, `aktivan=1`, nastao iz pozivnice |
| Prijava | Access (`/admin/sso`) ili passkey | samo passkey (Access ga ne pušta) |
| Katalog, situacije, odobravanje | sve | sve (autor se prati: `rijeci.dodao`, `slike.pregledao`, aktivnost) |
| Zadaci, bilježnice | sve | samo svoje (tuđe je 404) |
| Aktivnost | svi zapisi | samo svoji, bez administracije |
| AI (slike, izgovori) | bez limita (potrošnja se bilježi) | kvota za zadnjih 7 dana |
| Administracija | Prompt, Red, Korisnici, glasovi, prijava aplikacije, `/api/v1` | ništa (stranica „nemaš pristup”, 403) |

Popis ruta samo za superadmina je u `src/lib/admin/rute.ts`; nova administracijska stranica ide
tamo i u test.

**Izdavanje pozivnice:** `/admin/uprava/korisnici` → „Nova pozivnica” (e-mail, ime) → „Napravi link”.
Link `https://logomedo.com/admin/poziv#…` prikaže se **jednom**; pošalji ga osobno (ne u javni
kanal, ne u repo). Vrijedi 72 h i jednom: troši se tek kad logoped registrira passkey, a tada
odmah dobiva sesiju. Nova pozivnica za isti e-mail poništava staru. Otvorene pozivnice su u
tablici ispod i mogu se opozvati. Za e-mail iz `ADMIN_EMAILS` pozivnica se ne izdaje.

**Novi passkey** (izgubljen ili novi uređaj): u retku korisnika „Novi passkey” daje pozivnicu za
isti račun; stari ključevi ostaju. Samo za aktivnog logopeda: deaktiviranog vraća „Aktiviraj” ili
opća „Nova pozivnica”. Dodatni ključ logoped može dodati i sam na `/admin/passkeys` unutar 10 min
od prijave pozivnicom.

**Deaktivacija:** „Deaktiviraj” odmah briše sve njegove sesije i opoziva otvorene pozivnice;
passkeyi ostaju, pa „Aktiviraj” vraća pristup bez nove pozivnice.

**Limit:** u retku korisnika polja „slike” i „izgovori” (AI limit za 7 dana) → „Spremi”. Novi logoped
(pozivnica) dobiva 20 slika i 50 izgovora (`ZADANI_LIMIT` u `src/lib/admin/ovlasti.ts`, od 18. 11. 2026.;
stariji retci imaju 50 / 200 iz migracije 0032). Jedan posao u redu = jedan kredit (slika riječi ili situacije = slika;
izgovor = izgovor). Zahtjev koji traži više od preostalog odbija se cijeli, s porukom koliko je
ostalo i kad se prvi krediti vraćaju. Naplaćuje se i „Pokušaj ponovo” za neuspjele poslove
(logoped na `/admin/zvukovi` vidi i vraća samo izgovore koje je sam zatražio); „Pogurni red” i
probe glasova ne.

**Potrošnja:** `/admin/uprava/korisnici`, stupci „Potrošeno (7 dana)” i „Doprinos” (dodane riječi,
odobrene slike i izgovori). Logoped svoje preostalo vidi u bočnoj traci. Svaki upis je redak u
`ai_potrosnja` (tko, vrsta, količina, vrijeme); svaka radnja nad korisnicima i pozivnicama je u
Aktivnosti (`poziv.*`, `korisnik.*`).

**Passkey na Windowsu traži USB ključ (23. 11. 2026.):** pozvana logopedinja (Chrome, Windows 10)
dobila je odmah Windowsov prozor „Umetnite sigurnosni ključ u USB priključak”. Uzrok nije
hardver: Chrome nudi Google Password Manager samo kad je korisnik prijavljen u Chrome sa
sinkronizacijom lozinki. Inače posao preda Windowsu, a Windows bez postavljenog Hello PIN-a
nema što drugo ponuditi nego USB ključ. Stranica ne može prisiliti GPM. Od `19847cc`
`registrationOptions` šalje `hints: ["client-device", "hybrid"]` (preferiraj ovo računalo, pa
mobitel s QR-om). `preferredAuthenticatorType: "localDevice"` iz simplewebauthn je odbačen jer
postavlja i `authenticatorAttachment: "platform"`, što isključuje mobitel. Upute korisniku: prijava
u Chrome + sinkronizacija pa odabir „Google Password Manager”, ili Windows PIN (Postavke → Računi →
Mogućnosti prijave). „Odustani” ne troši pozivnicu (`iskoristena_at` se piše tek nakon uspješnog
verify), pa isti link radi ponovno.

## Bilo otvoreno prije produkcije (stavke 1–4 i 6 su gotove)

1. `wrangler d1 create logomedo` → upisati `database_id` u `wrangler.jsonc`; `npm run db:migrate`;
   seed remote (`wrangler d1 execute logomedo --remote --file seed/katalog.sql`).
2. `wrangler r2 bucket create logomedo-slike`.
3. Access aplikacija na **D.O.M.** računu (tim `domovina.cloudflareaccess.com`, isti kao omm):
   self-hosted, destinacija `logomedo.com/admin/sso`, IdP One-time PIN, politika s e-mailovima
   iz `ADMIN_EMAILS`. Upisati njen `ACCESS_AUD`. Access sesija je po timu: tko je prijavljen u
   omm ili MPT admin, ulazi bez novog koda.
4. `wrangler secret put RUNNER_TOKEN` (isti token u okolini runnera).
5. Domena: logomedo.com istječe 17. 11. 2026. Registracija je od 31. 10. na D.O.M.-u.
   Uključiti auto-renew i provjeriti karticu, jer obnova pinka.io i pinka.finance na D.O.M.-u nije prošla.
6. Sada je na logomedo.com stari app (Firebase). `routes` s `custom_domain` preuzima apex
   kad se deploya. Odlučiti kad.

## Lokalno

Access lokalno ne radi. Sesiju upiši u lokalni D1 i postavi kolačić:

```bash
T=$(openssl rand -hex 24); H=$(printf %s "$T" | shasum -a 256 | cut -d' ' -f1)
npx wrangler d1 execute logomedo --local --command "INSERT INTO admin_sessions (token_hash,email,method,created_at,expires_at,last_seen_at) VALUES ('$H','TVOJ_EMAIL','access',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+12 hours'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
echo "__Host-logomedo_admin=$T"   # kolačić za localhost:4321
```

`ADMIN_EMAILS` u `.dev.vars` je u navodnicima: e-mail za sesiju upiši bez njih (s navodnikom sesija tiho
ne vrijedi, `/admin` vraća na prijavu).

Kolačić se u Braveu postavi na `http://localhost:4321/admin/login` kroz konzolu:
`document.cookie = "__Host-logomedo_admin=<T>; path=/; secure; samesite=lax"` (Chromium dopušta `secure` na
localhostu). Prije toga `npx wrangler d1 migrations apply logomedo --local`. Lokalna baza ima tek 2 riječi sa
slikom, pa brojeve (npr. listić po glasovima) provjeravati istim upitom na `--remote` (samo čitanje).
`npm run dev` se odvoji kao pozadinski proces; gasi se s `npx astro dev stop`.
E-mail za lokalnu sesiju ne vadi `grep`-om iz `.dev.vars`: vrijednost `ADMIN_EMAILS` je u navodnicima, pa sesija dobije
e-mail s `"` i stranica ne prepozna admina.

Kad je sesija svježa (`method = 'access'`, < 10 min), na `/admin/passkeys` se može dodati
lokalni passkey (rpID `localhost`, ne vrijedi za produkciju).

## Bočna traka (14. 11. 2026.)

Izbornik je po poslu, ne po stranicama (`src/components/AdminOkvir.astro`): **Odobravanje** (Slike = `/admin/pregled`,
Izgovor = `/admin/zvukovi`, s brojem onoga što čeka), **Sadržaj** (Katalog; Riječi, Situacije i Znakovi su kartice u njemu),
**Vježbe** (Novi zadatak = `/admin/predlosci`, Zadaci, Bilježnice), a dolje bez okvira Red generiranja, Prompt, Aktivnost
i Ključevi. Prvi korak redizajna admina prema dizajnu u Claude artefaktu (poveznica u lokalnoj memoriji, ne ovdje).
Iz dizajna još nije napravljena „Početna” (pregled onoga što čeka), pa `/admin` ostaje Katalog.

**Scroll i sklapanje (17. 11. 2026.):** `nav` u traci ima vlastiti `overflow-y: auto`, pa logo, tražilica gore i
račun dolje ostaju na mjestu, a stavke se scrollaju (na prozoru visine 560 px izbornik ima 629 px sadržaja u 165 px).
Gumb `.sklopi` uz logo ili tipka `[` sklapa traku na 68 px (samo ikone; naziv u `title`, broj kao značka). Stanje je
`data-traka="uska"` na `<html>`, a pamti se u localStorage `logomedo-traka`; inline skripta u `<head>` ga postavlja prije
crtanja da ne trepne. U uskoj traci tražilica je gumb (ikona `trazi`) koji proširi traku i fokusira polje; `/` isto.
Na ≤ 860 px (mobitel, vodoravna traka) sklapanja nema. Oznaka „admin” uz logo je iz trake maknuta jer s gumbom ne stane
u 236 px; uloga piše dolje uz e-mail.

**Traka se sužava na /admin/pregled (21.–22. 11. 2026.):** i na mobitelu (Xiaomi) i na desktopu (Chrome, Windows) traka je
nakon par sekundi ostala široka samo koliko padding. Uzrok je sudar id-ova: `<aside class="traka" id="traka">` (dobio id
20. 11. za `aria-controls` hamburgera) i traka napretka `<i id="traka">` na pregledu. `brojac()` svake 3 s (`uskladi`)
radi `$("traka").style.width = "0%"` i pogađa prvi element s tim id-om, a to je bočna traka. Popravak: napredak je
`id="napredak-traka"`. **Id-ovi iz `AdminOkvir.astro` (`traka`, `trazi`, `trazi-rezultati`) ne smiju se ponoviti ni na
jednoj stranici admina.** Prvi pokušaj 21. 11. (širina ladice `300px` + `min-width: 260px` umjesto `min(300px, 86vw)`)
krivo je pretpostavio da Chrome `vw` računa kao 0; ostao je jer ne smeta.
