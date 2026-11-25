# Staging: staging.logomedo.com

Od 19. 11. 2026. (landing lanac S1, landing odluke 4–9, 100–1xx u `docs/landing/decisions.md`).
Zaseban Worker s kopijom produkcijske D1; javni dio otvoren, `/admin` zaštićen kao na produkciji. Produkcija se njime ne dira.

| | Produkcija | Staging |
|---|---|---|
| Worker | `logomedo` | `logomedo-staging` (`env.staging` u `wrangler.jsonc`) |
| Host | `logomedo.com`, `www` | `staging.logomedo.com` (custom domain) |
| D1 | `logomedo` | `logomedo-staging` (`7d5c46bf-…`) |
| R2 | `logomedo-slike`, `logomedo-javno` | `logomedo-staging-slike`, `logomedo-staging-javno` (prazni) |
| Queue | `logomedo-zvukovi` | `logomedo-staging-zvukovi` |
| KV `SESSION` | (adapter) | `logomedo-staging-session` (wrangler ga je sam stvorio pri prvom deployu) |
| Slike | `cdn.logomedo.com` | isti `cdn.logomedo.com` (samo čitanje, odluka 6) |
| Build | `dist/` | `dist-staging/` (gitignored) |

`stage.logomedo.com` je nešto drugo: stari Firebase stage.

## Deploy

```bash
npm run deploy:staging        # build u dist-staging/ + wrangler deploy --config dist-staging/server/wrangler.json
npm run db:migrate:staging    # migracije na logomedo-staging
```

- Staging se deploya s grane na kojoj se radi (npr. `landing`), iz čistog stabla.
- `npm run build:staging` (`scripts/staging-build.sh`) ne dira `dist/`, a redirect
  `.wrangler/deploy/config.json`, koji `@cloudflare/vite-plugin` prepiše pri svakom buildu, vraća na
  `dist/server`. Zato `wrangler` bez `--config` nikad ne gađa staging, a sve staging naredbe imaju
  `--config wrangler.jsonc --env staging` (osim deploya, koji ide na `dist-staging`).
- Zabranjeno za staging: `npm run deploy`, `npm run db:migrate`, `wrangler secret put` bez `--env staging`.

## Zaštita (landing odluka 207, zamjenjuje odluku 7)

Javni dio staginga (landing, `/b/…`, statičke datoteke) je otvoren kao na produkciji: to je javno
lice projekta. Basic Auth je uklonjen 19. 11. 2026. `/admin` štiti isti middleware kao na produkciji
(sesija; prijava Accessom ili passkeyem), `/api/v1` i `/api/runner/*` vlastiti bearer. Kad je
`OKRUZENJE=staging`, `src/lib/staging.ts` svim odgovorima, i statičkim datotekama
(`assets.run_worker_first: true`), dodaje `x-robots-tag: noindex`.

Prijava u admin na stagingu: „Prijava Accessom” (od 25. 11. 2026., vlastita Access aplikacija) ili passkey
upisan na stagingu; passkeyevi s produkcije ne vrijede (rpID je hostname). Detalji u „Prijava u admin”.
Secret `STAGING_LOZINKA` se više ne čita (može se obrisati `wrangler secret delete … --env staging`).

## Podaci: kopija produkcije

```bash
scripts/staging-osvjezi.sh
```

Ručno, ne po rasporedu. Staging D1 se obriše (DROP), shema nastane iz migracija ove kopije, tablice
se isprazne, pa se importa `wrangler d1 export logomedo --remote --no-schema`. Dump je samo u
`~/.cache/logomedo-staging/` i briše se odmah (i kod greške). Na kraju ispiše broj redaka ključnih
tablica na stagingu i na produkciji.

- **Export blokira produkcijsku D1 dok traje** (Cloudflare: baza za to vrijeme ne odgovara na upite).
  Izmjereno 19. 11. 2026.: 4–7 s za 13,5 MB podataka. Ne pokretati u petlji.
- Puni dump (shema + podaci) se ne može importati, pa slaganje radi `src/lib/staging-dump.ts`
  (redoslijed roditelj → dijete, samoreference `UPDATE`-om na kraju); detalji u zapisu
  `docs/landing/research/2026-11-19-astro-cloudflare-okruzenja.md`.
- Ako je produkcija ispred ove kopije (migracija koja ovdje još ne postoji), import padne: prvo
  `git pull`.

## Prijava u admin

**Access:** Cloudflare Access aplikacija „LogoMedo staging admin (sso)” štiti
`staging.logomedo.com/admin/sso`, s istim politikama kao produkcijska („OMM admini”, „LogoMedo admini”,
OTP na e-mail). AUD je u `env.staging.vars.ACCESS_AUD`. Uloga se i dalje računa iz secreta `ADMIN_EMAILS`
**staginga** i tablice `korisnici`, pa Access sam po sebi ne daje pristup.

**Passkey:** radi samo na domeni na kojoj je dodan. Staging je kopija produkcijske baze, pa
`/admin/postavke#kljucevi` (prije `/admin/passkeys`) ključeve s `logomedo.com` (`admin_passkeys.rp_id`, migracija 0049; NULL = produkcija)
pokazuje odvojeno, pod „Ključevi za drugu domenu”, i ne broji ih u limit od 5. Passkey dodan na stagingu
nestaje pri idućem osvježavanju podataka.

**Bez Accessa** (npr. curl): sesija se upisuje izravno:

```bash
scripts/staging-sesija.sh <email> [--superadmin]
```

Ispiše kolačić `__Host-logomedo_admin=<token>` (12 h). U pregledniku ga postavi u konzoli na
`https://staging.logomedo.com/admin/login`:
`document.cookie = "__Host-logomedo_admin=<token>; path=/; secure; samesite=lax"`.
Superadmin dolazi iz secreta `ADMIN_EMAILS` **staginga** (`--superadmin` ga postavi na taj jedan
e-mail); logoped iz tablice `korisnici` (kopija produkcije).

## E-pošta (Resend)

Od 25. 11. 2026. staging ima `RESEND_API_KEY` (isti ključ kao produkcija, secret staginga). Baza je kopija produkcijske
sa stvarnim adresama, pa `smijePrimiti` u `src/lib/email.ts` na stagingu (`OKRUZENJE=staging`) pušta samo adrese iz
`ADMIN_EMAILS` staginga, njihove `+aliase` (npr. ime+proba1@…) i `@logomedo.com`. Ostalima admin dobije poruku
„Staging šalje samo adminima…” i link za ručno slanje. Testne pozivnice zato idu na +alias svog e-maila.

## Što na stagingu ne radi

- **Kandidati slika:** privatni R2 staginga je prazan; vide se samo odobrene slike s `cdn.logomedo.com`.
  Učitavanje novih slika na stagingu ide u `logomedo-staging-*` i ne vidi se na `cdn`.
- **Izgovor (ElevenLabs), runner, Vertex, čišćenje cachea:** nema secreta (`ELEVENLABS_API_KEY`,
  `RUNNER_TOKEN`, `CF_PURGE_TOKEN`), odluka 9. Poslovi izgovora padaju u redu i ponavljaju se.
- **Passkey i sesije s produkcije** (rpID je hostname).
- **Mobilna aplikacija** može na staging (`/api/v1` ima vlastiti bearer), ali tokeni s produkcije
  vrijede samo dok se podaci ne osvježe.
