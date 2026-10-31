# logomedo.com

Novi LogoMedo: slikovni materijali za logopede. Prvi feature je **katalog slika po
glasovima**, preduvjet za sve ostalo (radni listići, ispis, korisnici).

Stack: Astro 7 (`output: "server"`) na Cloudflare Workers, D1, R2. Admin prijava je
Cloudflare Access (kod na e-mail) ili passkey, preneseno iz omm.domovina.ai.

| Dokument | Što |
|---|---|
| [docs/katalog.md](docs/katalog.md) | Shema, pozicije glasova, red generiranja i runner |
| [docs/admin.md](docs/admin.md) | Prijava, sesija, postavljanje Accessa |

## Lokalno

```bash
npm install
npm run db:migrate:local
npm run seed && npm run seed:local     # 428 riječi iz ../preuzimanje/data/catalog.csv
npm run dev                            # http://localhost:4321
scripts/runner.sh                      # generiranje slika (tmux + agy), drugi terminal
```

Access lokalno ne radi, a passkey treba postojeću sesiju. Sesiju upiši ručno, kao u
`docs/admin.md`.

## Provjere

`npm test` (pravopisna analiza glasova), `npm run check` (TypeScript/Astro), `npm run build`.
