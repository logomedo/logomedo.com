# TODO: angažman (podsjetnici, niz, ljestvica)

Radna lista. Čuva se u repou da napredak preživi između sesija. Označene stavke su gotove i provjerene
(`npm test && npm run check && npm run build` zeleno). Odluke idu u [decisions.md](decisions.md).

Plan po sesijama: [plan.md](plan.md). Handoff po sesiji: [handoffs/](handoffs/).

Legenda: `[x]` gotovo · `[ ]` otvoreno · `[~]` u radu · `(!)` traži korisnika · `→ Sn` planirana sesija

## Već postoji (prije lanca, 25. 11. 2026.)

- [x] Slanje kroz Resend (`src/lib/email.ts`, predlošci `emails/*.tsx` → `npm run emails`), staging šalje samo
      adminima, njihovim +aliasima i @logomedo.com (`smijePrimiti`)
- [x] Pozivnica nakon „Odobri” (`src/lib/admin/pozivi.ts`, vrijedi `POZIV_SATI` = 72 h, jednokratna)
- [x] `zahtjevi_pristupa` (status, `poziv_token_hash`), `pozivi` (`iskoristena_at`), `korisnici`, `zadaci.autor_id`,
      `ai_potrosnja`, `uredaji.zadnji_put`: iz njih se lijevak da izračunati
- [x] Throttle obavijesti po ključu (`obavijesti`, 0040)

## F0: mjerenje i temelj (ništa vidljivo korisnicima)

- [ ] Lijevak na stagingu (kopija produkcije): odobreno → pozivnica iskorištena → prvi zadatak → aktivan zadnjih
      14 dana; koliko je pozivnica isteklo neiskorišteno; razdioba aktivnosti po danu u tjednu. Samo zbirne brojke u
      `research/` → S1
- [ ] Istraživanje: Cloudflare Cron Triggers po okruženju (`env.staging.triggers`), `scheduled()` uz Astro handler
      u `src/worker.ts`, lokalni test (`--test-scheduled`); Resend `List-Unsubscribe` + One-Click (RFC 8058), batch
      i limiti plana; pravna osnova podsjetnika (ZEK, GDPR legitimni interes, odjava u svakoj poruci) → S1
- [ ] Odluke o segmentima, kadenci i pravilu niza potvrđene ili revidirane brojkama iz lijevka (blok 100) → S1
- [ ] Migracija `aktivni_dani` (korisnik, dan po Europe/Zagreb, vrste, broj; jedan redak po danu) → S2
- [ ] `src/lib/angazman/aktivnost.ts`: `zabiljeziDan()` (upsert, ne baca) iz spremanja zadatka, preuzimanja PDF-a,
      „Dijete rješava”, generiranja slika/izgovora, `/api/v1` → S2
- [ ] Backfill `aktivni_dani` iz `zadaci`, `zadatak_verzije`, `ai_potrosnja` (skripta, staging) → S2
- [ ] Testovi bez mreže, `skipped 0` → S2

## F1: automatski podsjetnici (staging)

- [ ] Cron Trigger (produkcija i staging) + `scheduled()` u `src/worker.ts`; prekidač `PODSJETNICI`
      (`iskljuceno` | `suho` | `ukljuceno`), produkcija `iskljuceno` → S3
- [ ] `src/lib/angazman/podsjetnici.ts`: čista funkcija `kome(stanje, sada)` → popis (osoba, vrsta) po segmentima
      A/B/C (decisions 4), globalna pravila (decisions 5) → S3
- [ ] Migracija `podsjetnici` (email, korisnik, vrsta, korak, poslano_at, ishod, resend_id) idempotentno po
      (email, vrsta, korak) i `korisnici.podsjetnici_odjava_at` → S3
- [ ] Segment A obnavlja pozivnicu (stara se opoziva, nova u mailu) kroz postojeći `pozivi.ts` → S3
- [ ] Odjava jednim klikom: potpisani link `/odjava-podsjetnika?t=…` (GET stranica + POST), zaglavlja
      `List-Unsubscribe` i `List-Unsubscribe-Post` → S3
- [ ] Predlošci `emails/Podsjetnik*.tsx` (A pozivnica, B prvi zadatak, C povratak), tekst bez žargona → S3
- [ ] E2E na stagingu: testni korisnici na +aliasima, simulirani datum, mailovi stvarno stigli, odjava radi → S3
- [ ] `/admin/uprava/podsjetnici`: lijevak s brojkama, „što bi otišlo u sljedećem pokretanju” (suho), poslani s
      ishodom, pregled predložaka, „Pokreni sad” (staging i datum za simulaciju) → S4
- [ ] Postavke korisnika: „Podsjetnici e-poštom” uključi/isključi → S4
- [ ] (!) Nacrt odlomka za `/privatnost` (podsjetnici, aktivni dani, ljestvica) i tekstovi mailova čekaju
      korisnika (i Anitu za ton) → S4 → vrata

## F2: niz (streak)

- [ ] `src/lib/angazman/niz.ts`: tjedni niz i aktivni dani u mjesecu iz `aktivni_dani` (čisto, testovi za prijelaz
      godine, DST, tjedan bez aktivnosti) → S5
- [ ] Prikaz: plamičak s brojem tjedana u traci admina, kalendar aktivnih dana (12 tjedana) na pregledu/Postavkama,
      proslava praga (4, 8, 12, 26, 52 tjedna) → S5
- [ ] `/api/v1/ja` vraća niz (app ga kasnije prikaže) → S5
- [ ] Segment D: „niz ističe” (samo onima koji su ga uključili, petkom ako ovaj tjedan nema aktivnog dana) → S5

## F3: ljestvica

- [ ] Opt-in u Postavkama (`korisnici.ljestvica_nadimak`, NULL = nisam na ljestvici) → S6
- [ ] `/admin/ljestvica`: aktivni dani ovaj mjesec i najdulji niz, top 20 + vlastito mjesto, superadmini isključeni → S6
- [ ] Ljestvica skrivena dok nema barem `LJESTVICA_MIN` sudionika (decisions 8) → S6

## F4: produkcija

- [ ] (!) Korisnik odobrio tekstove, `/privatnost` i uključivanje → vrata prije S7
- [ ] Migracije na produkciji, deploy, `PODSJETNICI=suho` jedno pokretanje, korisnik pregleda popis → S7
- [ ] (!) `PODSJETNICI=ukljuceno`, prvi stvarni mailovi, provjera isporuke u Resendu → S7
- [ ] `docs/angazman.md` (kako radi, prekidač, segmenti, odjava, zamke) i odlomak u `CLAUDE.md` → S7
