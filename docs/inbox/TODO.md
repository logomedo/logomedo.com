# TODO: inbox za transakcijske mailove

Radna lista. Čuva se u repou da napredak preživi između sesija. Označene stavke su gotove i provjerene
(`npm test && npm run check && npm run build` zeleno). Odluke idu u [decisions.md](decisions.md).

Plan po sesijama: [plan.md](plan.md). Handoff po sesiji: [handoffs/](handoffs/).

Legenda: `[x]` gotovo · `[ ]` otvoreno · `[~]` u radu · `(!)` traži korisnika · `→ Sn` planirana sesija

## Već napravljeno (prije lanca, 19. 11. 2026.)

- [x] Resend domena `logomedo.com` verified (eu-west-1); DNS `resend._domainkey`, `send` MX+TXT, `rsend` CNAME
- [x] `RESEND_API_KEY` secret samo na produkciji; „Odobri” šalje pozivnicu (`src/lib/email.ts`, odluka 625 u `docs/landing/decisions.md`)
- [x] React Email: `emails/*.tsx` → `npm run emails` → `src/lib/emails/generirano.ts`; pregled `npm run emails:dev`
- [x] DMARC `p=none`, izvještaji u Cloudflare DMARC Management

## F0: provjere i temelj (ništa vidljivo korisnicima)

- [ ] Istraživanje u `research/`: Resend prima li `headers` `In-Reply-To`/`References` pri slanju; točan Svix algoritam
      (test vektor iz Svix dokumentacije); kako se uključuje primanje i koja je MX vrijednost za poddomenu → S1
- [ ] Migracija `0039_inbox.sql`: `razgovori`, `poruke`, `privitci`, `brzi_odgovori` → S1
- [ ] `src/lib/svix.ts` (WebCrypto, tolerancija vremena 5 min) s testom na službenom vektoru → S1
- [ ] `src/lib/poruke.ts`: spremi dolaznu/odlaznu, nađi razgovor (adresa `odgovor+<kljuc>@…`, pa `In-Reply-To`, pa e-mail), nepročitano → S1
- [ ] `POST /api/resend/webhook`: potpis, idempotentno po `email_id`, dohvat tijela, privitci u R2 → S1
- [ ] Testovi bez mreže (fixture payloadi), `skipped 0` → S1

## F1: primanje na produkciji

- [ ] (!) MX za `poruke.logomedo.com` u Cloudflareu + primanje uključeno u Resendu → S2
- [ ] Webhook `email.received` kreiran kroz API, `RESEND_WEBHOOK_SECRET` secret na produkciji → S2
- [ ] Pozivnica dobiva `reply_to` `odgovor+<kljuc>@poruke.logomedo.com`; odlazni mail se upisuje u razgovor → S2
- [ ] `/privatnost`: dopisivanje se čuva u bazi, rok čuvanja → S2
- [ ] (!) e2e: pozivnica na vlastitu adresu, odgovor iz Gmaila, poruka u D1 s tijelom i privitkom → S2

## F2: admin sučelje

- [ ] `/admin/poruke`: popis razgovora (nepročitani prvi), brojač u bočnoj traci superadmina → S3
- [ ] `/admin/poruke/[id]`: nit, privitci (preuzimanje iz R2), označi pročitano → S3
- [ ] Odgovor iz admina: `emails/Odgovor.tsx`, `In-Reply-To`/`References`, upis u nit → S3
- [ ] Brzi odgovori: popis, dodaj/uredi/obriši, umetanje u odgovor (skripta s nonceom, bez inline) → S3
- [ ] Mobilni izgled (memorija: statična kopija + headless Chrome) → S3

## F3: zatvaranje

- [ ] Retencija poruka i privitaka (pri otvaranju `/admin/poruke`, kao `pristup.ts`) → S4
- [ ] Obavijest superadminu e-poštom o novoj poruci i novom zahtjevu za pristup (odluka 710 landinga) → S4
- [ ] Novi zahtjev na `/pristup` i ručni „Novi razgovor” iz admina → S4
- [ ] (!) Apex `logomedo.com`: `include:_spf.google.com` u SPF i Google DKIM (Google Admin) prije DMARC `quarantine` → S4 / korisnik
- [ ] Produkcija, e2e, `docs/inbox.md` (kako radi) → S4
