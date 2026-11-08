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

Kad je sesija svježa (`method = 'access'`, < 10 min), na `/admin/passkeys` se može dodati
lokalni passkey (rpID `localhost`, ne vrijedi za produkciju).
