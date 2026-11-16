# Odluke: RBAC, pozivnica, AI kvota

Svaka odluka ima broj, datum, razlog i uvjet revizije. Odluka se ne briše nego zamjenjuje novom
(„zamjenjuje N”). Blokovi po sesiji: S0 1–99, S1 100–199, S2 200–299, S3 300–399, S4 400–499, S5 500–599.

## S0 (16. 11. 2026.)

**1. Opseg.** Samo `logomedo.com`. `../app` i `../preuzimanje` se ne diraju. `/api/v1` ostaje samo za
superadmina (logoped dobiva 403 jer `uloga()` vraća `null`). Revizija: kad aplikacija dobije logopede.

**2. Superadmin je samo `ADMIN_EMAILS`.** Vrijednost `korisnici.uloga` se za superadmina ne čita.
Logoped je redak s `uloga='logoped' AND aktivan=1` čiji e-mail nije u `ADMIN_EMAILS`. Postojeći
retci s `uloga='admin'` izvan `ADMIN_EMAILS` nemaju pristup (kao danas). Razlog: bazu ne treba
smatrati izvorom najviše ovlasti; nema samopromocije ni zaključavanja. Revizija: > 3 superadmina.

**3. Identitet ostaje e-mail.** `admin_passkeys.email`, `admin_sessions.email`, `korisnici.email`.
Bez refaktora na `korisnik_id`. E-mail logopeda nije provjeren OTP-om: dokaz je posjed pozivnice.
Razlog: najmanja promjena sigurnosnog sloja. Revizija: promjena e-maila korisnika.

**4. Pozivnica.** Token 32 B (base64url), u bazi samo sha-256, link `/admin/poziv#<token>` (fragment
ne ide u logove ni Referer), vrijedi 72 h, jednokratna, troši se tek uspješnom registracijom
passkeya, atomski (`UPDATE … WHERE iskoristena_at IS NULL AND istjece > now RETURNING`). Pozivnica
za postojećeg logopeda služi za novi passkey (izgubljen uređaj). Nikad za e-mail iz `ADMIN_EMAILS`.

**5. Sesija iz pozivnice** ima `method='poziv'` i vrijedi kao svježa prijava (dodavanje passkeya
unutar 10 min). Trajanje i neaktivnost kao i ostale sesije (12 h / 2 h).

**6. Dvije uloge, ovlasti u kodu** (`src/lib/admin/ovlasti.ts`), bez tablica uloga i ovlasti.
Razlog: dva testera; uređivač uloga je trošak bez koristi. Revizija: treća uloga.

**7. Katalog: logoped ima puna prava** (odobri, odbij, preimenuj, obriši, upload, generiraj).
Autor se prati: `aktivnost.tko`, `generiranja.zatrazio`, `slike.pregledao`, novi `rijeci.dodao`.
Odluka korisnika 16. 11. 2026.

**8. Zadaci i bilježnice: logoped vidi i mijenja samo svoje.** Superadmin sve. Javne bilježnice
(`/b/<slug>`) ostaju javne. Situacije (pozadine) su dio kataloga, zajedničke. Odluka korisnika.

**9. Aktivnost:** logoped vidi i poništava samo svoje zapise.

**10. AI kvota.** Klizni prozor 7 dana, odvojeno **slike** (Vertex: slike riječi i situacije) i
**izgovori** (ElevenLabs). Jedan posao upisan u red = jedan kredit. Zadano **50 slika i 200
izgovora** po logopedu, stupci na `korisnici`, superadmin ih mijenja na `/admin/korisnici`.
Superadmin bez limita (potrošnja se svejedno bilježi). Zahtjev koji traži više od preostalog
odbija se cijeli, s porukom koliko je ostalo i kad se oslobađa. Upis u `ai_potrosnja` je uvjetni
`INSERT … SELECT … WHERE zbroj + n <= limit` u istom D1 batchu kao posao. Probe glasova
(`zvuk-proba`) su administracija, ne kvota. Polazne brojke su korisnikove (16. 11.); revizija nakon
prvog tjedna testiranja.

**11. Testovi.** `node --test` kao i dosad. SQL koji ide u D1 testira se na `node:sqlite` (Node 24,
SQLite 3.53) nad svim migracijama; S1 mjeri prolaze li sve. Bez mreže, `skipped 0`. e2e lokalno
s `playwright-cli` i virtualnim WebAuthn autentifikatorom (CDP `WebAuthn.addVirtualAuthenticator`).

**12. Produkcija** samo u S5, nakon korisnikovog „go”: `npm run db:migrate` s provjerom izlaza
(bez `| tail`), pa `npm run deploy`. Nikad obrnuto (docs/admin.md, zamka 8. 11. 2026.).

**13. Javnost.** Plan je u javnom repou; ne sadrži e-mailove, imena testera, tokene ni linkove.

## S1 (16. 11. 2026.)

**100. Šav za testove: `module.registerHooks`, bez izmjene produkcijskog koda.** `npm test` je
`node --import ./src/lib/test/registracija.ts --test …`; sinkroni resolve hook preusmjerava
`cloudflare:workers` na `src/lib/test/cloudflare-workers.ts` (promjenjivi `env`, testovi postave
`env.DB = napraviD1()` i `env.ADMIN_EMAILS`) i relativne importe bez ekstenzije (`./sesija`, Vite stil)
pokuša s `.ts`. Odbačeno: modul `src/lib/db.ts` s `DB()` (40 datoteka importa `env` izravno, pa bi
šav pokrio samo dio koda). Revizija: Node bez `registerHooks` ili prelazak na vitest/workerd.

**101. Harness `src/lib/test/d1.ts`** (`napraviD1({ doMigracije? })`, `procitajMigraciju`): `node:sqlite`
u memoriji, migracije sortirane po punom imenu. **Mjerenje: svih 32 postojećih (0001–0031, obje
`0030_*`) i 0032 prolaze, bez zaobilaznica.** `batch` u transakciji s rollbackom, `undefined` u
`bind` baca kao D1. Revizija: prva migracija koju node:sqlite ne podnese (zapisati, ne preskočiti tiho).

**102. Ovlasti** (`src/lib/admin/ovlasti.ts`): `katalog`, `zadaci`, `ai` (obje uloge);
`ai.bez_limita`, `sve.zadaci`, `aktivnost.tudja`, `korisnici`, `administracija` (samo superadmin).
`odrediUlogu(email, adminEmails, redak)` je jedino mjesto pravila iz odluke 2; test drži skup ključeva
fiksnim pa nova ovlast ne prolazi bez testa. (potvrditi imena)

**103. `getSession`:** jedan upit `admin_sessions LEFT JOIN korisnici ON k.email = lower(s.email)`.
`Session` dobiva `uloga` i `korisnikId` (superadmin bez retka: `null`). Uloga se određuje pri svakom
zahtjevu, pa deaktivacija ili micanje iz `ADMIN_EMAILS` gasi postojeću sesiju odmah. Usporedba
e-maila je bez obzira na velika slova (prije: točna, ali e-mailovi su ionako mala slova).
`ulogaZa(email)` je isti put za `verifyLogin`; `/admin/sso` ostaje samo `ADMIN_EMAILS`.

**104. `korisnikId()` i `postaviLogopedskiMod()`:** redak `uloga='admin'` nastaje samo za e-mail
iz `ADMIN_EMAILS`. Za ostale `korisnikId` vraća postojeći id ili baca (logoped redak nastaje
isključivo iz pozivnice, S2), a `postaviLogopedskiMod` radi samo `UPDATE`. Posljedica za S3: poziv
iz rute za korisnika bez retka treba biti 403, ne 500.

**105. 0032 deaktivira postojeće retke `uloga='logoped'`** (`aktivan=0`, `deaktiviran_at`). Stupac
`uloga` ima zadano `'logoped'`, pa bi eventualni stari retci inače odjednom dobili pristup čim
imaju passkey ili sesiju. Logoped postaje aktivan samo pozivnicom (S2 mora pri iskorištenju postaviti
`aktivan=1, deaktiviran_at=NULL`). Prije `db:migrate` u S5: `SELECT uloga, aktivan, COUNT(*) FROM
korisnici GROUP BY 1,2` (samo čitanje). (potvrditi)

**106. Superadmin s retkom `aktivan=0` ili `uloga='logoped'` ostaje superadmin** (odluka 2: redak se
za njega ne čita). Deaktivacija superadmina na `/admin/korisnici` (S2) zato nema smisla: sakriti je.

**107. Do S3 aktivni logoped vidi cijeli admin.** S1 daje sesiju, ograničenja ruta dolaze u S3.
Nije rizik jer ništa ne ide na produkciju prije S5, a logoped redak lokalno nastaje tek iz pozivnice
(S2). Lokalna provjera S1 (curl s kolačićem): superadmin 200 na `/admin`, `/admin/pregled`,
`/admin/zvukovi`; aktivni logoped 200; deaktivirani logoped i `admin` redak izvan `ADMIN_EMAILS` 302 na prijavu.

**108. `src/lib/app/sesija.ts` zadržava svoj `Uloga = "admin"`** (odluka 1, `/api/v1` samo
superadmin). Dva pojma „Uloga” žive odvojeno do revizije odluke 1. (potvrditi)
