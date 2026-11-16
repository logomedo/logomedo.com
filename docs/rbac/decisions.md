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
