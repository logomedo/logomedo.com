# Resend primanje, Svix potpis, niti (S1, 19. 11. 2026.)

Pročitano 19. 11. 2026. kroz web-fetch iz službene dokumentacije. Uz svaku tvrdnju je izvor. Što dokumentacija
ne kaže, piše „otvoreno” i ide u S2.

## 1. Svix potpis webhooka

| Tvrdnja | Izvor |
| --- | --- |
| Tajni ključ je `whsec_` + base64; HMAC ključ su base64-dekodirani bajtovi dijela iza prefiksa | https://docs.svix.com/receiving/verifying-payloads/how-manual |
| Potpisuje se `${svix-id}.${svix-timestamp}.${tijelo}`, tijelo **sirovo**, kako je stiglo | isto; https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests |
| HMAC-SHA256, izlaz base64 | https://docs.svix.com/receiving/verifying-payloads/how-manual |
| Zaglavlja `svix-id`, `svix-timestamp` (sekunde od epohe), `svix-signature` | isto; Resend verify stranica |
| `svix-signature` je popis odvojen razmacima, svaki `vN,<base64>` (npr. `v1,… v2,…`); prihvaća se ako bilo koji `v1` odgovara | https://docs.svix.com/receiving/verifying-payloads/how-manual; test „multi sig payload is valid” u https://github.com/svix/svix-webhooks/blob/main/javascript/src/webhook.test.ts |
| Usporedba u konstantnom vremenu | https://docs.svix.com/receiving/verifying-payloads/how-manual |
| Tolerancija vremena: dokumentacija kaže samo „within your tolerance”; Svix biblioteka koristi 5 min | manual stranica; `webhook.test.ts` |
| Biblioteka prihvaća ključ i bez prefiksa `whsec_` | test „verification works with and without signature prefix”, `webhook.test.ts` |

Službeni test vektori (u `src/lib/svix.test.ts`):

- Manual stranica (i Resend verify stranica, isti): `whsec_plJ3nmyCDGBKInavdOK15jsl`, `msg_loFOjxBNrRLzqYUf`,
  `1731705121`, `{"event_type":"ping","data":{"success":true}}` → `v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=`.
- `webhook.test.ts` „sign function works”: `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`, `msg_p5jXN8AQM9LWM0D4loKWxJek`,
  `1614265330`, `{"test": 2432232314}` → `v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=`.

## 2. Primanje (Resend Receiving)

### Uključivanje i MX

| Tvrdnja | Izvor |
| --- | --- |
| Na verificiranoj domeni: prekidač „Receiving” na stranici domene u dashboardu; modal pokaže MX zapis; „I've added the record” verificira samo MX, slanje se ne verificira ponovno | https://resend.com/docs/dashboard/receiving/custom-domains |
| API: `POST /domains` ima `capabilities: { sending, receiving }` (`enabled`/`disabled`, `receiving` zadano `disabled`) | https://resend.com/docs/api-reference/domains/create-domain |
| API: `PATCH /domains/{id}` mijenja `capabilities`; izostavljeno polje ostaje, barem jedna mora ostati uključena | https://resend.com/docs/api-reference/domains/update-domain |
| Ako root već ima MX, preporuka je poddomena (npr. `subdomain.example.com`) s Resendovim MX-om; MX vrijedi samo za poddomenu na kojoj je | custom-domains; https://resend.com/docs/knowledge-base/how-do-i-avoid-conflicting-with-my-mx-records |
| MX vrijednost dokumentacija ne navodi (pokaže je dashboard); primjeri: `receive.forge.rmta.net`, `receive-euw1.forge.rmta.net`, `inbound-smtp.<regija>.amazonaws.com`. Resendov MX mora imati najmanji broj prioriteta za tu domenu | custom-domains |

**Otvoreno za S2:** mora li `poruke.logomedo.com` biti zaseban unos u `/domains` (s vlastitom verifikacijom)
ili se primanje za poddomenu uključuje na `logomedo.com`. Dokumentacija to ne kaže izravno; budući da se
verificira „domain object”, vjerojatnije je zaseban unos (`POST /domains` `{ name: "poruke.logomedo.com",
region: "eu-west-1", capabilities: { sending: "disabled", receiving: "enabled" } }`). S2 to provjeri kroz API
(`GET /domains`, pa po potrebi `POST`) i uzme točnu MX vrijednost iz odgovora ili dashboarda. Apex MX se ne dira
(odluka 3), pa je poddomena jedina opcija koja ne dira Gmail.

### Webhook `email.received`

| Tvrdnja | Izvor |
| --- | --- |
| `{ type, created_at, data }`; `data`: `email_id`, `created_at`, `from`, `to[]`, `cc[]`, `bcc[]`, `received_for[]`, `message_id`, `subject`, `attachments[]` (`id`, `filename`, `content_type`, `content_disposition`, `content_id`) | https://resend.com/docs/webhooks/emails/received |
| Webhook ne nosi tijelo, zaglavlja ni sadržaj privitaka | isto |
| `from` je gola adresa; ime je u `headers.from` dohvaćenog maila | isto |
| `message_id` je RFC `Message-ID` | isto |
| Postoji i zaseban `inbox.email.received` (ne koristimo) | https://resend.com/docs/dashboard/webhooks/event-types |

Polazni sažetak iz S0 je točan, samo nepotpun (privitci imaju i `content_disposition`, `content_id`; `data`
ima i `cc`, `bcc`, `received_for`, `created_at`).

### Dohvat primljenog maila

| Tvrdnja | Izvor |
| --- | --- |
| `GET https://api.resend.com/emails/receiving/{id}` | https://resend.com/docs/api-reference/emails/retrieve-received-email |
| Odgovor: `id`, `to[]`, `from`, `created_at`, `subject`, `html`, `html_format`, `text`, `headers` (objekt), `cc[]`, `bcc[]`, `reply_to[]`, `received_for[]`, `authentication` (`spf`, `dkim`, `dmarc`), `message_id`, `raw` (`download_url`, `expires_at`), `attachments[]` (`id`, `filename`, `content_type`, `content_disposition`, `content_id`, `size`) | isto |
| `?html_format=cid` ostavlja `cid:` reference umjesto ugrađenih slika (iznad 100 MB uvijek `cid`) | isto |
| `raw.download_url` je potpisan CloudFront URL izvornog maila s privitcima | isto |

### Privitci primljenog maila

| Tvrdnja | Izvor |
| --- | --- |
| `GET /emails/receiving/{email_id}/attachments` (`limit` 1–100, zadano 20; `after`/`before` kursori); odgovor `{ object: "list", has_more, data[] }` | https://resend.com/docs/api-reference/emails/list-received-email-attachments |
| Stavka: `id`, `filename`, `size`, `content_type`, `content_disposition`, `content_id`, `download_url`, `expires_at` | isto |
| `GET /emails/receiving/{email_id}/attachments/{id}` vraća jednu stavku istog oblika | https://resend.com/docs/api-reference/emails/retrieve-received-email-attachment |
| `download_url` vrijedi 1 sat, poslije se ponovno zove popis | https://resend.com/docs/dashboard/receiving/attachments |

Ograničenje veličine dolaznog maila ni privitka nije nađeno u stranicama primanja ni u
https://resend.com/docs/knowledge-base/account-quotas-and-limits (primljeni mail se broji u kvotu kao jedan mail).
Zato granice postavljamo sami (odluka 103).

### Webhook kroz API

| Tvrdnja | Izvor |
| --- | --- |
| `POST https://api.resend.com/webhooks` `{ endpoint, events: ["email.received"] }`; odgovor `{ object: "webhook", id, signing_secret }` | https://resend.com/docs/api-reference/webhooks/create-webhook |
| `signing_secret` vraćaju i create, retrieve i list | https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests |

## 3. Niti: `In-Reply-To` i `References` pri slanju

| Tvrdnja | Izvor |
| --- | --- |
| `POST /emails` ima `headers` (objekt), „Custom headers to add to the email”; `In-Reply-To`/`References` tamo nisu imenovani | https://resend.com/docs/api-reference/emails/send-email |
| Vodič za odgovor na primljeni mail šalje `headers: { "In-Reply-To": "<message_id>", "References": "<…> <…>" }` i predmet s „Re:” | https://resend.com/docs/dashboard/receiving/reply-to-emails |

Zaključak: `In-Reply-To` i `References` su dokumentirani upravo za ovaj slučaj, pa ih koristimo. **Otvoreno za
S2/S3 (e2e):** prolaze li netaknuti do Gmaila (Gmail spaja nit po `References` i predmetu) i koji `Message-ID`
dobiva naš odlazni mail (odgovor `POST /emails` vraća samo Resendov `id`). Dok to nije poznato, nit u D1 drži
ključ u adresi za odgovor (odluka 4), a `References` dolaznog maila se uspoređuju sa svim spremljenim
`message_id` (i dolaznim), pa nit nađe i kad naš odlazni `Message-ID` nije poznat.
