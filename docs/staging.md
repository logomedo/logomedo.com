# Staging: staging.logomedo.com

Od 19. 11. 2026. (landing lanac S1, landing odluke 4–9, 100–1xx u `docs/landing/decisions.md`).
Zaseban Worker s kopijom produkcijske D1, iza lozinke. Produkcija se njime ne dira.

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

## Lozinka (Basic Auth)

Kad je `OKRUZENJE=staging` (samo `env.staging`), `src/worker.ts` sve zahtjeve propušta kroz
`src/lib/staging.ts`: Basic Auth, korisničko ime proizvoljno, lozinka = secret `STAGING_LOZINKA`.
Vrijedi i za statičke datoteke (`assets.run_worker_first: true`). Izuzeti su `/api/v1*` i
`/api/runner/*` (vlastiti bearer). Bez secreta staging vraća 503. Svi odgovori imaju
`x-robots-tag: noindex`.

Lozinka je u `.env.staging` (gitignored) u radnoj kopiji koja ju je postavila
(`/Users/ms/git/logomedo/logomedo.com-landing`). Promjena:

```bash
printf %s "<nova>" | CLOUDFLARE_ACCOUNT_ID=7dc7167b7e2e00923bfa7cd697df14e4 npx wrangler secret put STAGING_LOZINKA --config wrangler.jsonc --env staging
```

Preglednik pita lozinku jednom po sesiji; `curl -u x:"$STAGING_LOZINKA" https://staging.logomedo.com/`.

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

Passkeyevi i sesije s produkcije na stagingu ne vrijede (rpID je hostname), a Accessa nema
(`ACCESS_AUD` prazan, `/admin/sso` vraća 503). Sesija se upisuje izravno:

```bash
scripts/staging-sesija.sh <email> [--superadmin]
```

Ispiše kolačić `__Host-logomedo_admin=<token>` (12 h). U pregledniku ga postavi u konzoli na
`https://staging.logomedo.com/admin/login`:
`document.cookie = "__Host-logomedo_admin=<token>; path=/; secure; samesite=lax"`.
Superadmin dolazi iz secreta `ADMIN_EMAILS` **staginga** (`--superadmin` ga postavi na taj jedan
e-mail); logoped iz tablice `korisnici` (kopija produkcije). Kad je sesija svježa, na
`/admin/passkeys` se može dodati passkey za `staging.logomedo.com`; nakon idućeg osvježavanja
podataka nestaje.

## Što na stagingu ne radi

- **Kandidati slika:** privatni R2 staginga je prazan; vide se samo odobrene slike s `cdn.logomedo.com`.
  Učitavanje novih slika na stagingu ide u `logomedo-staging-*` i ne vidi se na `cdn`.
- **Izgovor (ElevenLabs), runner, Vertex, čišćenje cachea:** nema secreta (`ELEVENLABS_API_KEY`,
  `RUNNER_TOKEN`, `CF_PURGE_TOKEN`), odluka 9. Poslovi izgovora padaju u redu i ponavljaju se.
- **Passkey i sesije s produkcije**, **Access** (`/admin/sso` 503).
- **Mobilna aplikacija** može na staging (`/api/v1` nije iza lozinke), ali tokeni s produkcije
  vrijede samo dok se podaci ne osvježe.

## Access kasnije

Wrangler OAuth nema Access ovlast (landing odluka 7). Kad korisnik u dashboardu napravi Access
aplikaciju za `staging.logomedo.com`, Basic Auth može ostati kao drugi sloj. Da Access zamijeni
lozinku, treba izmjena `src/lib/staging.ts` (npr. provjera `Cf-Access-Jwt-Assertion` kao u
`src/lib/admin/`) s testom; samo brisanje secreta ne pomaže, jer bez njega staging vraća 503.
Za `/admin/sso` na stagingu upisati AUD te aplikacije u `env.staging.vars.ACCESS_AUD`.
