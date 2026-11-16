# TODO — RBAC: logopedi u adminu (pozivnica, ovlasti, AI kvota)

Radna lista. Čuva se u repou da napredak preživi između sesija. Označene stavke su gotove
i provjerene (`npm test && npm run check && npm run build` zelen). Odluke idu u [decisions.md](decisions.md).

Plan po sesijama: [plan.md](plan.md). Handoff po sesiji: [handoffs/](handoffs/).
Sve putanje su relativne na korijen repoa `logomedo.com/`.

Legenda: `[x]` gotovo · `[ ]` otvoreno · `[~]` u radu · `(!)` traži korisnika · `→ Sn` planirana sesija

## F0 — Temelj: uloge u bazi i sesiji (ništa vidljivo, ništa na produkciji)

- [x] Test-harness `src/lib/test/d1.ts`: `node:sqlite` primijeni sve `migrations/*.sql` redom i vrati objekt s D1 API-jem (`prepare/bind/first/all/run`, `batch`) → S1
- [x] Mjerenje: prolaze li sve migracije 0001–0031 u `node:sqlite` (broj, iznimke zapisati u odluku) → S1 (33/33, odluka 101)
- [x] `migrations/0032_korisnici_uloge.sql`: `korisnici.aktivan`, `deaktiviran_at`, `limit_slike_7d`, `limit_zvukovi_7d`; tablice `pozivi` i `ai_potrosnja`; `rijeci.dodao` → S1
- [x] `src/lib/admin/ovlasti.ts`: tip `Uloga = 'superadmin' | 'logoped'`, popis ovlasti, `smije(uloga, ovlast)`; jedinični testovi matrice → S1
- [x] `getSession` vraća `uloga` i `korisnikId` (JOIN na `korisnici`); logoped = `uloga='logoped' AND aktivan=1`; superadmin samo iz `ADMIN_EMAILS` → S1
- [x] `verifyLogin` propušta aktivnog logopeda; `/admin/sso` i dalje samo superadmin → S1
- [x] `korisnikId()` više ne upisuje `'admin'` za nepoznate e-mailove bez provjere (odluka u S1) → S1

## F1 — Pozivnica i upravljanje korisnicima

- [x] `src/lib/admin/pozivi.ts`: izdaj (token 32 B, sha-256, 72 h), provjeri, iskoristi atomski; odbija e-mail iz `ADMIN_EMAILS` → S2
- [x] `/admin/poziv` (token u `#fragmentu`) + `/admin/poziv/options` i `/admin/poziv/verify` (javne putanje u middlewareu) → S2
- [x] Uspješna registracija: korisnik (logoped, aktivan) + passkey + sesija `method='poziv'` u jednom koraku → S2
- [x] `/admin/korisnici` (samo superadmin): popis, nova pozivnica, pozivnica za novi passkey, deaktiviraj/aktiviraj, limiti → S2
- [x] Zapisi u `aktivnost`: pozivnica izdana, iskorištena, korisnik deaktiviran/aktiviran, limit promijenjen → S2
- [x] e2e lokalno (playwright-cli + virtualni WebAuthn autentifikator): pozivnica → passkey → odjava → prijava passkeyem → deaktivacija gasi sesiju → S2

## F2 — Ovlasti i vlasništvo

- [x] Middleware: tablica ruta samo za superadmina (`prompt`, `red`, `korisnici`, `zvukovi/glasovi`, `api/zvuk-proba`, `app/prijava`); čista funkcija + testovi → S3
- [x] Vlasništvo: zadaci, bilježnice (popis, otvaranje, spremanje, brisanje, dijete-prikaz) samo autor ili superadmin → S3
- [x] Aktivnost: logoped vidi i vraća samo svoje zapise → S3
- [x] UI: `AdminOkvir` i stranice skrivaju što uloga ne smije; oznaka uloge u bočnoj traci → S3
- [x] e2e kao logoped: 403/preusmjeravanje na zabranjenim rutama, tuđi zadatak 404 → S3

## F3 — AI kvota i praćenje autora

- [x] `src/lib/kvota.ts`: preostalo po vrsti (klizni 7 dana), atomski uvjetni upis u `ai_potrosnja` u istom batchu kao posao → S4
- [x] Kvota na svim točkama troška: `dodajURed`, `dodajZvukove`, `pozadine-generiranje` (`zatrazi`, `dupliciraj`, `ponovi`), `ponoviZvuk`, `odbijZvukove(ponovo)`, `aktivnost.vrati` (ponovno u red) → S4
- [x] Poruka pri prekoračenju (preostalo, kad se oslobađa); cijeli zahtjev odbijen → S4
- [x] Preostale slike/izgovori u bočnoj traci za logopeda → S4
- [x] `rijeci.dodao` pri novoj riječi; „dodao” vidljiv na riječi → S4
- [x] `/admin/korisnici`: potrošnja 7 dana, dodane riječi, odobrenja po korisniku → S4
- [x] Testovi na `node:sqlite`: limit točno na granici, dva istovremena zahtjeva ne prelaze limit → S4

## F4 — Pregled, produkcija, testeri

- [x] `/code-review high` nad rasponom S1–S4, popravci → S5 (`0cd2281`, odluka 500)
- [x] `docs/admin.md`: uloge, pozivnica, kvota, kako dići limit → S5
- [ ] (!) Korisnik daje „go” za produkciju → S5
- [ ] `npm run db:migrate` (0032) s provjerom izlaza, pa `npm run deploy` → S5
- [ ] Smoke na produkciji: superadmin prijava (passkey i Access) radi kao prije → S5
- [ ] (!) Dvije pozivnice za alpha testere (imena i kanal slanja daje korisnik; e-mailovi ne idu u repo) → S5
