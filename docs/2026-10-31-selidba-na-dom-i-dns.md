# Selidba logomedo.com na D.O.M. i prvi deploy (31. 10. 2026.)

## Stanje nakon selidbe

| Što | Gdje |
|---|---|
| Registracija (Cloudflare Registrar) | D.O.M. `7dc7167b…`, istječe 17. 11. 2026. Auto-renew treba biti uključen, a obnova pinka.io i pinka.finance na D.O.M.-u nije prošla |
| Aktivna zona | D.O.M. `c12293517eb61e46975c4145f8e66a61`, NS `jessica`/`nitin` |
| Stara zona | ITalk `0d3dc5057c604f116c78e28a7bf733a9`, NS `art`/`elle`. **Ne može se obrisati** („domain is registered through Cloudflare's Registrar”, iako je registracija već na D.O.M.-u) |
| Worker `logomedo` | custom domain `logomedo.com` i `www` (www ide 301 na apex u middlewareu) |
| Pages `logomedo-landing`, `lojtrica` | ostaju na **ITalku**; u D.O.M. zoni su CNAME-ovi `landing`, `lojtrica` |
| `stage.logomedo.com` | stari Firebase stage, A zapisi ostavljeni |
| `stage-storage` | CNAME na Google Storage, vraćao je 530 već prije; nije prenesen |

## Zamke

1. **Uvoz zone na D.O.M. nije preuzeo sve zapise.** ITalk zona je imala 19 zapisa, a uvezeno je 16.
   Nedostajali su `landing`, `lojtrica` i `stage-storage` (CNAME-ovi). Kod sljedeće selidbe usporediti
   popis zapisa obje zone redak po redak.
2. **Resolveri drže stare NS do 2 dana** (TTL NS zapisa u `.com` je 172800 s). 1.1.1.1 je i dalje pitao
   `art`/`elle`, a stara zona je odgovarala Firebase IP-jevima. Flush DNS-a na Macu tu ne pomaže.
   Rješenje: u staroj zoni A zapise za apex i www usmjeriti na anycast IP-jeve nove zone
   (`104.21.87.70`, `172.67.142.47`, DNS only). Edge šalje promet Workeru po hostu.
   Provjera: `dig @art.ns.cloudflare.com` i `dig @jessica.ns.cloudflare.com`.
3. **Custom domain Workera ne preuzima host koji ima A zapis** (greška 100117 „externally managed DNS
   records”). Firebase A zapise za apex i www treba prvo obrisati.
4. **`wrangler deploy` bez builda šalje stare varijable.** `@astrojs/cloudflare` kod builda kopira
   `wrangler.jsonc` u `dist/server/wrangler.json`. Zbog toga je `ACCESS_AUD` otišao prazan, pa gumb za
   Access nije bio na stranici za prijavu. Deploy samo s `npm run deploy`.
5. **CNAME na Pages projekt drugog računa:** `lojtrica` je spremljen kao proxied i ipak radi
   (200, nema greške 1014). `landing` je DNS only. Oba su provjerena preko nove zone.
6. Moj wrangler OAuth token ima `zone (read)`, ali **ne smije čitati ni pisati DNS zapise**. DNS se
   mijenja u dashboardu. Skripta u stranici dashboarda (fetch na `/api/v4`) je blokirana, a auto-mode
   klasifikator je odbio klik na Save za DNS zapis. Takve korake radi korisnik.

## Access

Aplikacija „LogoMedo admin (sso)” (AUD `81d4dce3…`, tim `domovina.cloudflareaccess.com`) štiti samo
`logomedo.com/admin/sso`. Politike: „LogoMedo admini” (admin1@example.com, admin2@example.com,
admin3@example.com) i „OMM admini”, a dovoljna je bilo koja. Isti popis mora biti u `ADMIN_EMAILS`.

**Otvoreno:** OTP kod nije stigao na admin3@example.com, iako je politika ispravna i vezana uz
aplikaciju (provjereno u dashboardu). Treba pogledati Zero Trust → Logs → Access, Gmail Spam i
Promocije te je li e-mail upisan točno.

Vezano: [admin.md](admin.md), [katalog.md](katalog.md).
