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

- [x] Istraživanje u `research/`: Resend prima li `headers` `In-Reply-To`/`References` pri slanju; točan Svix algoritam
      (test vektor iz Svix dokumentacije); kako se uključuje primanje i koja je MX vrijednost za poddomenu → S1
- [x] Migracija `0039_inbox.sql`: `razgovori`, `poruke`, `privitci`, `brzi_odgovori` → S1
- [x] `src/lib/svix.ts` (WebCrypto, tolerancija vremena 5 min) s testom na službenom vektoru → S1
- [x] `src/lib/poruke.ts`: spremi dolaznu/odlaznu, nađi razgovor (adresa `odgovor+<kljuc>@…`, pa `In-Reply-To`, pa e-mail), nepročitano → S1
- [x] `POST /api/resend/webhook`: potpis, idempotentno po `email_id`, dohvat tijela, privitci u R2 → S1
- [x] Testovi bez mreže (fixture payloadi), `skipped 0` → S1

## F1: primanje na produkciji

- [x] (!) MX za `poruke.logomedo.com` u Cloudflareu + primanje uključeno u Resendu → S2
- [x] Webhook `email.received` kreiran kroz API, `RESEND_WEBHOOK_SECRET` secret na produkciji → S2
- [x] Pozivnica dobiva `reply_to` `odgovor+<kljuc>@poruke.logomedo.com`; odlazni mail se upisuje u razgovor → S2
- [x] `/privatnost`: dopisivanje se čuva u bazi, rok čuvanja → S2
- [x] (!) e2e: pozivnica na vlastitu adresu, odgovor iz Gmaila, poruka u D1 s tijelom i privitkom → S2

## F2: admin sučelje

- [x] `/admin/poruke`: popis razgovora (nepročitani prvi), brojač u bočnoj traci superadmina → S3
- [x] `/admin/poruke/[id]`: nit, privitci (preuzimanje iz R2), označi pročitano → S3
- [x] Odgovor iz admina: `emails/Odgovor.tsx`, `In-Reply-To`/`References`, upis u nit → S3
- [x] Brzi odgovori: popis, dodaj/uredi/obriši, umetanje u odgovor (skripta s nonceom, bez inline) → S3
- [x] Mobilni izgled (lokalni dev + headless Chrome, odluka 311) → S3
- [x] (!) Produkcija i e2e: odgovor iz admina u Gmail u istoj niti, odgovor na njega opet u razgovoru, brzi odgovor → S3

## F3: zatvaranje

- [x] Retencija poruka i privitaka (pri otvaranju `/admin/poruke`, kao `pristup.ts`), odluka 400 → S4
- [x] Obavijest superadminu e-poštom o novoj poruci i novom zahtjevu za pristup (odluka 401; e2e isporučeno, 403) → S4
- [x] Novi zahtjev na `/pristup` (obavijest) i ručni „Novi razgovor” iz admina (`/admin/poruke/novi`, odluka 402) → S4
- [x] Gumb „Pošalji” zaključan uz „Šaljem…”, Idempotency-Key protiv dvostrukog slanja (odluka 312) → S3
- [x] Nove poruke bez ručnog osvježavanja: polling 12 s dok je kartica vidljiva (odluka 313) → S3
- [x] Apex SPF `include:_spf.google.com` (firebasemail ostaje), odluka 405 → S4
- [ ] (!) Google DKIM za `logomedo.com` (Google Admin → TXT `google._domainkey` u Cloudflare) prije DMARC `quarantine` → S5 / korisnik
- [ ] DMARC `p=quarantine` nakon 2–4 tjedna izvještaja s Google SPF/DKIM bez neuspjeha (Cloudflare DMARC Management) → korisnik
- [ ] `_spf.firebasemail.com` iz SPF-a kad se potvrdi da stari app više ne šalje → korisnik
- [ ] Poveznica „Napiši” na `/admin/korisnici` (po potrebi)
- [x] Produkcija (`495af0f7`), e2e obavijesti, `docs/inbox.md` (kako radi) → S4
