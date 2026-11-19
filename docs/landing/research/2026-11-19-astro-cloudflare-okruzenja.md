# Astro + Cloudflare: okruženja, staging build i e2e (S1, 19. 11. 2026.)

Verzije: `@astrojs/cloudflare` 14.4.3, `@cloudflare/vite-plugin` 1.66.0, `wrangler` 4.156.0.

## Kako adapter bira okruženje

- `@astrojs/cloudflare` (`dist/index.js`) ne bira okruženje sam: predaje konfiguraciju
  `@cloudflare/vite-plugin`u, koji čita `CLOUDFLARE_ENV` (`getCloudflareEnv`, `index.mjs`) i
  spljošti `env.<ime>` u izlazni `dist/server/wrangler.json` (`name`, `targetEnvironment`,
  `topLevelName`, `definedEnvironments`). `utils/wrangler-config.js` (`loadWranglerEnv`) isto čita
  `CLOUDFLARE_ENV`, ali samo da `vars` dođu u `process.env` za `astro:env` pri buildu.
- Izlaz ide u `<outDir>/server/wrangler.json`, pa `astro build --outDir dist-staging` daje
  zaseban `dist-staging/server/wrangler.json` (`"targetEnvironment":"staging"`,
  `"name":"logomedo-staging"`). `dist/` ostaje netaknut.
- **Zamka:** plugin pri svakom buildu prepiše `.wrangler/deploy/config.json` (redirect za
  `wrangler` bez `--config`) na zadnji build. Nakon staging builda bi `npx wrangler d1 migrations
  apply logomedo --remote` čitao staging konfiguraciju. `scripts/staging-build.sh` ga zato vraća na
  `dist/server` (ili briše ako produkcijskog builda nema), a staging naredbe idu s
  `--config wrangler.jsonc --env staging`; s redirectom `--env` ionako nije dopušten
  (`Redirected configurations cannot include environments`, wrangler `cli.js`).
- `assets`: adapter/plugin postave `{"binding":"ASSETS","directory":"../client"}`; `assets` iz
  `env.staging` se spoji, pa `"run_worker_first": true` stoji samo u staging izlazu. Astro handler
  (`utils/handler.js`) sam poslužuje `env.ASSETS` kad Worker ide prvi, pa statičke datoteke rade iza
  Basic Autha (e2e dolje: `/favicon.svg` 401 bez lozinke, 200 s njom).
- KV `SESSION`: adapter dodaje `kv_namespaces: [{binding:"SESSION"}]` bez id-a; prvi
  `deploy:staging` je sam stvorio `logomedo-staging-session`.

## Dokaz da je produkcija ista (korak 4)

Referenca: `dist/server/wrangler.json` builda na 3d7c621 prije ikakve izmjene. Poslije izmjena
(`npm run build`, pa `npm run build:staging`, redirect vraćen na `dist/server`):

```
$ diff <(python3 -m json.tool wrangler.ref.json) <(python3 -m json.tool dist/server/wrangler.json)
@@ -2,7 +2,9 @@
    "configPath": "/Users/ms/git/logomedo/logomedo.com-landing/wrangler.jsonc",
    "userConfigPath": "/Users/ms/git/logomedo/logomedo.com-landing/wrangler.jsonc",
    "topLevelName": "logomedo",
    "definedEnvironments": [],[
        "staging"
    ],
    "account_id": "7dc7167b7e2e00923bfa7cd697df14e4",
    "compatibility_date": "2026-10-01",
    "compatibility_flags": [
```

Jedina razlika je `definedEnvironments`. Wrangler ga koristi samo za oznake skripte
(`applyServiceAndEnvironmentTags`, `cli.js`): produkcijski deploy će Workeru `logomedo` dodati tag
`cf:service=logomedo` (grupiranje okruženja u dashboardu) i ispisati upozorenje „Wrangler found
named environments…” za `versions upload`. Kod, bindingi, rute, `vars`, assets i observability su
isti. Landing odluka 101.

Kod Workera se mijenja (omotač `stagingVrata` u `src/worker.ts`), ali bez `OKRUZENJE` vraća
točno odgovor iz `ulaz()` (testovi „produkcija (bez OKRUZENJE)” u `src/lib/staging.test.ts`).

## D1 export: blokiranje i trajanje

Cloudflare: export s `--remote` za svog trajanja čini bazu nedostupnom za upite
([D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/),
[API export](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/)).
Izmjereno (`date +%s` oko `wrangler d1 export`): puni dump 5 s
(13 475 487 B), `--no-schema` 4–7 s (13 457 627 B). Ukupno je u S1 produkcija
bila blokirana oko 40 s u osam exporta (razvoj i dijagnostika skripte, svaki pojedinačno).

Zašto ne puni dump: tablice idu redom nastanka, a INSERT u `stilovi` referencira `prompt_verzije`
koja se stvara kasnije → `no such table: main.prompt_verzije`. S `--no-schema` i shemom iz migracija
D1 import i dalje padne na `FOREIGN KEY constraint failed`, jer se commita u dijelovima
(`PRAGMA defer_foreign_keys` iz dumpa ne pokriva granicu dijela) i jer samoreference (`slike`
27 redaka, `podrucja` 9) pokazuju na kasnije retke. `src/lib/staging-dump.ts` slaže naredbe
roditelj → dijete, a samoreference upisuje `UPDATE`-om na kraju. Migracije same upisuju retke
(`prompt_verzije`, `glasovi`…), pa se nakon njih sve tablice isprazne prije importa.

Lokalni sqlite3 3.51 s istim migracijama ostavi `aktivnost.vraca_id REFERENCES aktivnost_nova`
(RENAME u 0033 ne ažurira referencu), pa tamo svaki INSERT u `aktivnost` padne. Na D1 (produkcija
i staging) referenca je ispravna (`instr(sql,'aktivnost_nova') = 0`), pa to nije produkcijska
greška; `staging-dump.ts` takav viseći ključ ipak nulira i javi.

Zadnje pokretanje:

```
== pražnjenje staginga (DROP svih tablica, dijete → roditelj)
== shema staginga (migracije ove kopije)
== export produkcije, samo podaci (blokira produkcijsku D1 dok traje)
export: 4 s, 13457627 B
== import u staging
import: 5 s
== broj redaka (staging | produkcija)
staging:    {"rijeci":753,"slike":1642,"korisnici":3,"admin_sessions":2,"app_sesije":2,"zadaci":165,"d1_migrations":38}
produkcija: {"rijeci":753,"slike":1642,"korisnici":3,"admin_sessions":2,"app_sesije":2,"zadaci":165,"d1_migrations":38}
```

## e2e (korak 9), 19. 11. 2026. oko 15:45

Deploy: `npm run deploy:staging` → `logomedo-staging`, verzija `29d3bcf4-45f8-42c0-8df6-aefc461ff40d`,
`staging.logomedo.com (custom domain)`. Prije `wrangler secret put STAGING_LOZINKA` staging je vraćao
503 i na `/` i na `/favicon.svg` (s `x-robots-tag: noindex`). Sesija iz
`scripts/staging-sesija.sh <email> --superadmin` (token skriven):

```
$ curl -sI https://staging.logomedo.com/   # bez lozinke
HTTP/2 401 
www-authenticate: Basic realm="LogoMedo staging", charset="UTF-8"
x-robots-tag: noindex
$ curl -sI -u x:*** https://staging.logomedo.com/
HTTP/2 200 
x-robots-tag: noindex
$ curl -sI https://staging.logomedo.com/favicon.svg   # bez lozinke
HTTP/2 401 
www-authenticate: Basic realm="LogoMedo staging", charset="UTF-8"
x-robots-tag: noindex
$ curl -sI -u x:*** https://staging.logomedo.com/favicon.svg
HTTP/2 200 
content-type: image/svg+xml
x-robots-tag: noindex
$ curl -sI -u x:kriva https://staging.logomedo.com/
HTTP/2 401 
$ curl -s -o /dev/null -w "%{http_code} %{redirect_url}" -u x:*** https://staging.logomedo.com/admin   # bez kolačića
302 https://staging.logomedo.com/admin/login?next=%2Fadmin
$ curl -s -o /dev/null -w "%{http_code}" -u x:*** -b "__Host-logomedo_admin=<token>" https://staging.logomedo.com/admin
200
$ curl -sI https://staging.logomedo.com/api/v1/katalog   # bez lozinke i tokena
HTTP/2 401 
x-robots-tag: noindex
$ curl -s https://staging.logomedo.com/api/v1/katalog
{"error":"unauthorized"}
$ curl -sI https://staging.logomedo.com/admin/sso -u x:***
HTTP/2 503 
$ curl -sI https://logomedo.com/   # produkcija bez lozinke
HTTP/2 200 
```

Produkcija (`npx wrangler deployments list --name logomedo`) prije i poslije sesije ista, zadnja:

```
Created:     2026-11-19T14:13:02.465Z
Version(s):  (100%) e8968f33-eabd-4aa0-a4a1-20f361912118
```
