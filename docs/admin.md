# Admin: Cloudflare Access (OTP) + passkey

Kod je iz `~/git/domovinatv/omm.domovina.ai` (`src/lib/admin/*`, `src/middleware.ts`,
`migrations/0005_admin.sql`), a tamo iz pay.domovina.ai. Sigurnosnu logiku držati u
skladu s njima.

- `/admin/sso` štiti Access aplikacija (One-time PIN na e-mail). Worker dodatno provjerava
  JWT (potpis, issuer, `ACCESS_AUD`) i `ADMIN_EMAILS`.
- Passkey se dodaje samo u sesiji otvorenoj Accessom unutar zadnjih 10 min. Najviše 5 po e-mailu.
- Sesija: kolačić `__Host-logomedo_admin`, u D1 samo sha-256 (`admin_sessions`). Traje 12 h,
  istječe nakon 2 h neaktivnosti.
- CSRF: svaki POST mora imati `Origin` jednak originu. CSP s nonceom.
- `/api/runner/*` ne koristi sesiju nego bearer `RUNNER_TOKEN` (secret).

## Otvoreno prije produkcije

1. `wrangler d1 create logomedo` → upisati `database_id` u `wrangler.jsonc`; `npm run db:migrate`;
   seed remote (`wrangler d1 execute logomedo --remote --file seed/katalog.sql`).
2. `wrangler r2 bucket create logomedo-slike`.
3. Zero Trust organizacija na **ITalk** računu (zona logomedo.com je tamo, ne na D.O.M.-u
   gdje je `domovina.cloudflareaccess.com`). Access aplikacija self-hosted, destinacija
   `logomedo.com/admin/sso`, IdP One-time PIN, politika s e-mailovima iz `ADMIN_EMAILS`.
   Upisati `ACCESS_TEAM_DOMAIN` i `ACCESS_AUD`.
4. `wrangler secret put RUNNER_TOKEN` (isti token u okolini runnera).
5. Domena: logomedo.com istječe 17. 11. 2026., a auto-renewal ne prolazi.
6. Sada je na logomedo.com stari app (Firebase). `routes` s `custom_domain` preuzima apex
   kad se deploya. Odlučiti kad.

## Lokalno

Access lokalno ne radi. Sesiju upiši u lokalni D1 i postavi kolačić:

```bash
T=$(openssl rand -hex 24); H=$(printf %s "$T" | shasum -a 256 | cut -d' ' -f1)
npx wrangler d1 execute logomedo --local --command "INSERT INTO admin_sessions (token_hash,email,method,created_at,expires_at,last_seen_at) VALUES ('$H','admin1@example.com','access',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+12 hours'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
echo "__Host-logomedo_admin=$T"   # kolačić za localhost:4321
```

Kad je sesija svježa (`method = 'access'`, < 10 min), na `/admin/passkeys` se može dodati
lokalni passkey (rpID `localhost`, ne vrijedi za produkciju).
