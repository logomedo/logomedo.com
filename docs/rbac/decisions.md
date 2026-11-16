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
fiksnim pa nova ovlast ne prolazi bez testa.

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
korisnici GROUP BY 1,2` (samo čitanje).

**106. Superadmin s retkom `aktivan=0` ili `uloga='logoped'` ostaje superadmin** (odluka 2: redak se
za njega ne čita). Deaktivacija superadmina na `/admin/korisnici` (S2) zato nema smisla: sakriti je.

**107. Do S3 aktivni logoped vidi cijeli admin.** S1 daje sesiju, ograničenja ruta dolaze u S3.
Nije rizik jer ništa ne ide na produkciju prije S5, a logoped redak lokalno nastaje tek iz pozivnice
(S2). Lokalna provjera S1 (curl s kolačićem): superadmin 200 na `/admin`, `/admin/pregled`,
`/admin/zvukovi`; aktivni logoped 200; deaktivirani logoped i `admin` redak izvan `ADMIN_EMAILS` 302 na prijavu.

**108. `src/lib/app/sesija.ts` zadržava svoj `Uloga = "admin"`** (odluka 1, `/api/v1` samo
superadmin). Dva pojma „Uloga” žive odvojeno do revizije odluke 1.

## S2 (16. 11. 2026.)

**200. Migracija 0033.** `aktivnost.tablica` imao je CHECK na 4 tablice, pa je tablica prebačena
(rebuild, svi retci i id-jevi zadržani, 4 indeksa ponovno) da dopusti `korisnici` i `pozivi`. `pozivi`
dobiva `id INTEGER PRIMARY KEY` i `passkey_id`: UI i zapisi koriste `id`, `token_hash` ne izlazi iz baze
(ni u snimci aktivnosti). `admin_challenges.purpose` nema CHECK, pa `'poziv'` ne traži migraciju.
**Prije `db:migrate` u S5:** `SELECT COUNT(*) FROM aktivnost` (rebuild cijele tablice na produkciji).

**201. Iskorištenje pozivnice je jedan batch koji ne može stvoriti dvaput** (odluka 4). Prva naredba:
`UPDATE pozivi SET iskoristena_at, passkey_id = <id novog ključa> WHERE token_hash AND otvorena AND
e-mail nije superadmin RETURNING`; upis korisnika i passkeya su `INSERT … SELECT … FROM pozivi p WHERE
p.token_hash = ? AND p.passkey_id = <isti id>`. Oznaka je id ključa, ne vrijeme (dva pokušaja u istoj
milisekundi bi se oba poklopila s vremenom). E-mail dolazi iz retka pozivnice, ne iz parametra. Testovi:
tri paralelna pokušaja i deterministički slučaj iste milisekunde.

**202. Korisnik pri iskorištenju:** upsert `uloga='logoped', aktivan=1, deaktiviran_at=NULL`,
`ime = COALESCE(novo, staro)` (odluka 105). Redak `'admin'` izvan `ADMIN_EMAILS` postaje logoped samo pozivnicom.

**203. Nova pozivnica za isti e-mail opoziva staru otvorenu** (zapis `poziv.zamijenjen`): vrijedi samo
zadnji link.

**204. Deaktivacija:** `aktivan=0`, `deaktiviran_at`, brisanje svih njegovih `admin_sessions` i opoziv
njegovih otvorenih pozivnica (inače bi stari link vratio pristup). Passkeyi ostaju.

**205. Superadmin može ponovno aktivirati deaktiviranog logopeda izravno, bez pozivnice.** Malo
popušta odluku 105: tako se mogu aktivirati i stari retci koje je 0032 deaktivirao, ali samo
svjesnom radnjom superadmina na `/admin/korisnici`.

**206. Superadmin je nedodirljiv na `/admin/korisnici`:** svaka radnja odbija e-mail iz `ADMIN_EMAILS`,
i iskorištenje ga odbija ako je `ADMIN_EMAILS` promijenjen nakon izdavanja.

**207. Zapisi u aktivnosti:** `poziv.izdan`, `poziv.zamijenjen`, `poziv.iskoristen` (`tko` = e-mail
pozvanog), `poziv.opozvan`, `korisnik.aktiviran`, `korisnik.deaktiviran`, `korisnik.limit`. Nijedan
se ne može vratiti (`vrati()` ih odbija, gumbi skriveni).

**208. Greške prema van su jednolike:** options uvijek „Pozivnica ne vrijedi. Zatraži novu.”, verify
uvijek jedna poruka; razlog ide samo u `console.error` bez tokena.

**209. Zadnja prijava** = najkasnije od početka sesije i `admin_passkeys.last_used_at` (istekle sesije
se brišu, pa same sesije nisu dovoljne).

**210. `/admin/passkeys`** je već filtrirao po e-mailu sesije; popis i brisanje premješteni u
`passkey.ts` (`mojiKljucevi`, `obrisiKljuc`) s testom. Pozivnica **ne** provodi limit od 5 ključeva po
e-mailu (pozivnica za novi passkey je svjesna radnja superadmina). Za S5 review.

**211. e2e: `scripts/e2e-poziv.sh`** (lokalno, uz `npm run dev`): `npx --yes @playwright/cli@0.1.21`
(globalni `playwright-cli` nije instaliran), sve korake logopeda radi jedan `run-code` jer virtualni
autentifikator (CDP `WebAuthn.addVirtualAuthenticator`) živi dok i CDP sesija; `run-code` nema
globalni `URL`. Superadmin je prvi e-mail iz `.dev.vars` (ne ispisuje se), logoped
`e2e-<vrijeme>@primjer.hr`, superadmin radnje kroz `curl` s Originom. Pod `wrangler dev` Worker vidi
`logomedo.com` (custom domain), pa rpID ne bi bio `localhost`: e2e ide samo na `astro dev`.

## S3 (16. 11. 2026.)

**300. Rute samo za superadmina** (`src/lib/admin/rute.ts`, `SAMO_SUPERADMIN`): `/admin/prompt`, `/admin/red`,
`/admin/korisnici`, `/admin/zvukovi/glasovi`, `/admin/api/zvuk-proba`, `/admin/app/prijava`, `/admin/api/app-kod`
(potvrda prijave aplikacije). Prefiks pogađa točnu putanju i `prefiks/…`, ne `prefiksXYZ`; provjerava se sirova i
dekodirana putanja (`//`→`/`, mala slova), kao `adminPutanja`. Pregled svih 54 datoteka nije našao ništa dodatno.
Inventar: `research/2026-11-16-rute-po-ulozi.md`. Revizija: nova administracijska stranica (dodati u popis i test).

**301. 403 za logopeda:** GET/HEAD izvan `/admin/api/` dobiva stranicu `/admin/nemas-pristup` (rewrite u
middlewareu, `AdminOkvir`, status 403; oznaka `x-nemas-pristup` potvrđuje rewrite, inače zamjenski HTML, također 403).
Ostalo JSON `{"error":"forbidden"}` 403. e2e potvrđuje da dolazi prava stranica. `//admin//red` u `astro dev`
daje 404 prije middlewarea (nije curenje; e2e provjerava samo da nije 200).

**302. Vlasništvo kroz jedan filtar** (`src/lib/admin/vlasnistvo.ts`): `autorFiltar(session)` = `null` za superadmina,
inače `korisnikId` (logoped bez retka baca). Funkcije u `zadaci/baza.ts` i `biljeznice.ts` primaju filtar kao obavezan
argument i u SQL-u rade `AND (?n IS NULL OR autor_id = ?n)`, pa je tuđe 404 (otvaranje, dijete-prikaz, spremanje,
brisanje, vraćanje iz koša, zvukovi zadatka, sve akcije bilježnice). Javni `/b/<slug>` ne gleda autora.

**303. Bilježnica ne prima tuđi zadatak:** pri spremanju zadatak ulazi samo ako postoji i ako je autorov, ili je već
bio u toj bilježnici (npr. ubacio ga superadmin). Logoped tako ne može tuđi zadatak izložiti na javnoj `/b/<slug>`.
Nepostojeći id se preskače (prije FK greška, i za superadmina).

**304. Brisanje zadatka zadržava prvo vrijeme brisanja** (`COALESCE`), pa ponovni „obriši” ne daje 404.

**305. Aktivnost za logopeda** (odluka 9): popis i „autori” samo njegov `tko`, bez zapisa s `tablica IN
('korisnici','pozivi')` (administracija; inače bi vidio svoj `poziv.iskoristen`); `tko` iz URL-a se ignorira.
Poništi/vrati: cijela grupa mora biti njegova i bez administracije, inače 403 prije izmjene.

**306. `/admin/passkeys` ostaje logopedu** (njegovi ključevi). `/admin/postavke` nema globalnih postavki (samo
vlastiti `logopedski_mod`), ostaje obje uloge bez izmjena.

**307. `/api/v1/admin/*` bez filtra autora** (uloga `admin` aplikacije, odluka 1 i 108). Iz `/api/v1/admin/biljeznice`
ne izlazi novo polje `autor` (e-mail).

**308. UI:** bočna traka skriva poveznice kroz `smijeNa(uloga, href)` (isti popis kao middleware) i pokazuje ulogu;
`/admin/zvukovi` logopedu prikazuje glas bez poveznice na glasove; stupac Autor na popisima zadataka i bilježnica
samo superadmin.

**309. `src/lib/elevenlabs.ts`:** parametar-svojstvo u konstruktoru (`public status`) pretvoren u obično polje, jer
`node --test` (type stripping) ne podnosi parameter properties, a testovi sad uvoze `biljeznice.ts`. Ponašanje isto.

**310. Otvoreno za S5 review (potvrditi):** `provjeriPolja` u poruci o zauzetoj poveznici otkriva naslov tuđe
bilježnice; u bilježnici koju je superadmin dopunio svojim zadatkom logoped vidi naslov zadatka, a poveznica daje 404.
„Pogurni red” i „Pokušaj ponovo” na `/admin/zvukovi` ostaju logopedu kao dio kataloga; S4 ih mora provjeriti kao točke
troška.

## S4 (16. 11. 2026.)

**400. Atomska naplata: NOT NULL poništava batch.** Prva (ili zadnja prije upisa posla) naredba u istom
`db.batch` je `INSERT INTO ai_potrosnja … SELECT …, CASE WHEN zbroj_7d + n <= limit THEN n ELSE NULL END`;
limit se čita samo za `uloga='logoped' AND aktivan=1`. Bez mjesta je `kolicina` NULL, `NOT NULL constraint
failed: ai_potrosnja.kolicina` poništi cijeli batch (i posao), `jePrekoracenje` to prepoznaje i baca
`KvotaPrekoracena`. Odbačeno: posao s `WHERE EXISTS (redak potrošnje)` (traži oznaku retka i uvjet na
svakom INSERT-u). Superadmin: bezuvjetni upis. Harness je već poništavao batch kao D1 (bez izmjene).
Revizija: D1 batch prestane biti transakcija.

**401. Količina je točna:** broj ili SQL koji broji istim uvjetom kao upis (`zatrazi` „već u redu”,
„nema što ponoviti” se ne naplaćuju). U `aktivnost.vrati` naplata ide neposredno prije upisa posla, ne
prva u batchu, jer brisanja ranije u batchu mijenjaju brojanje. `dodajURed` je jedan batch za cijeli
zahtjev (prije batch po 50) i uklanja duple id-jeve.

**402. Identitet bez novih potpisa:** točke troška i dalje primaju `email`; `platitelj(email)` (kroz
`ulogaZa`, S1) daje `{email, uloga, korisnikId}`. Superadmin bez retka dobiva redak `admin` kroz
`korisnikId(email)` (odluka 104), pa se potrošnja uvijek bilježi. Nepoznat ili deaktiviran: ista
`KvotaPrekoracena` s limitom 0, ništa upisano.

**403. Naplaćuje se vraćanje neuspjelih poslova u red** („Pokušaj ponovo” na `/admin/zvukovi` →
`greskeURed(email)`, na `/admin/red` → `neuspjeliURed`) onome tko klikne, n = broj vraćenih. Ne naplaćuje
se: `posaljiZaglavljene` („Pogurni red”, već plaćeni poslovi, odluka 310), runnerovi ponovni pokušaji
(`uzmi`, `odgodi`, `neuspjeh`), `preimenuj`, probe glasova (administracija). (potvrdio korisnik 16. 11.)

**404. Gdje se mijenja nešto prije posla, prvo `provjeri` (nije atomski):** odbijanje slike s `ponovi`,
`premjesti` s `ponovi`, `nova-rijec` (n = broj stilova), `dupliciraj` s uputom. Ako netko istovremeno
potroši kredite, odluka, riječ ili kopija ostaje bez posla (nova-rijec: preusmjerenje na riječ s porukom
kvote). Za S5 review: kopija iz izgubljene utrke u `dupliciraj` se ne briše. (potvrdio korisnik 16. 11.)

**405. `odbijZvukove({ponovo})`:** odbijanje i novi posao su jedan batch; bez kredita se poništava i odbijanje.

**406. Prikaz prekoračenja na jednom mjestu** (middleware `sKvotom`, i za `/api/v1`): JSON 429
`{error:'kvota', poruka, greska, ok:false}` za `/api/*`, `x-ajax` i fetch na `/admin/api/*`; obrasci
303 natrag (Referer istog izvora, inače `/admin`) s `?kvota=` (banner u `AdminOkvir`). `?kvota=`, ne
`?greska=`, jer `situacije` i `nova-rijec` već prikazuju `?greska=` pa bi poruka bila dvaput.

**407. Poruka:** „Ostalo ti je X od L slika/izgovora (ovo traži N); prvi krediti vraćaju se u srijedu
18. 11. u 14:05.” (Europe/Zagreb); zagrada samo kad zahtjev traži više od preostalog.

**408. `rijeci.dodao` se ne prepisuje.** Pri sukobu s postojećom riječi `dodao = COALESCE(rijeci.dodao,
CASE WHEN rijeci.aktivna = 0 THEN excluded.dodao END)`: autora dobiva samo neaktivna riječ bez autora.
Inače bi seed riječi dobile autora čim ih netko upiše u editoru zadatka ili božićnoj bilježnici. Upis na
svih pet mjesta (`api/nova-rijec`, `api/rijeci`, `generiranje` premjesti, `biljeznice`, `znakovi-baza`),
e-mail malim slovima. `premjesti` nema test (treba R2).

**409. Autor na `/admin/rijec/[slug]`** je ime iz `korisnici`, e-mail samo kad imena nema (logoped ime ima
iz pozivnice). Katalog je zajednički, pa ga vidi i logoped. (potvrdio korisnik 16. 11.)

**410. Doprinos na `/admin/korisnici`** (jedan agregatni upit `doprinosi()`): dodane riječi = sada aktivne
riječi vrste riječ s tim `dodao`; odobrene slike/izgovori = sada odobreni s tim `pregledao` (kasnije
zamijenjeni se ne broje, „automatski” se nikome ne pripisuje). Potrošnja 7 dana „X/L”, superadmin samo X.

**411. Bočna traka:** logoped vidi „Preostalo (7 dana)” slike i izgovore (0 crveno, na mobitelu samo ikona
i broj), jedan `preostalo()` po zahtjevu; superadmin ništa.

**412. e2e korak 3c** (`scripts/e2e-poziv.sh`, prije deaktivacije): limit slika 1, prvi zahtjev = posao
`ceka` i jedan redak `ai_potrosnja`, drugi = poruka kvote, provjera bočne trake i `/admin/korisnici`,
zatim brisanje posla, potrošnje i riječi iz lokalne baze. Runner se ne pokreće.

## S5 (16. 11. 2026.)

**500. Code review** (`/code-review high` nad `5f441e1..712bddc`): 10 nalaza. Popravljeno u `0cd2281`: pozivnica
„Novi passkey” za deaktiviranog (504), „Pokušaj ponovo” naplaćivao tuđe greške (501), kvota nakon spremljene odluke
(502), `nova-rijec` brojala stilove koji ne ulaze u red, neograničeni batch u `dodajURed` (503), lažna poruka kroz
`?kvota=` (505), suvišan uvjet u izborniku, mrtvi parametar `prije` u `upisiPoslove`. Zatvoreno bez izmjene:
pozivnica ne provodi limit od 5 ključeva (odluka 210 ostaje, svjesna radnja superadmina); matrica `OVLASTI` i
`rute.ts` su dva mjesta (matrica je opis i test, provedba su `rute.ts`, `autorFiltar` i kvota; spajanje kad dođe
treća uloga, odluka 6); `iskoristi()` ponovno čita pozivnicu (jedan D1 upit, ostaje radi jednostavnosti).
Lokalni e2e `scripts/e2e-poziv.sh` nakon popravaka: PROŠLO.

**501. Neuspjele izgovore logoped vraća u red samo ako ih je sam zatražio** (`lower(zvuk_generiranja.zatrazio)` =
njegov e-mail); popis grešaka mu je filtriran isto, pa broj na gumbu odgovara naplati. Superadmin sve. Brojač „Nije
uspjelo” u kartici ostaje globalan. Dopunjuje odluku 403.

**502. Kvota potrošena nakon spremljene odluke** (`odluciIPonovi`, `premjesti`; utrka iz odluke 404) daje uspjeh s
poljem `upozorenje`, ne 429; `/admin/pregled` prikaže upozorenje i ide dalje. Ako kvote nema već pri `provjeri`,
ostaje 429 i ništa se ne sprema. `/api/v1` dobiva novo polje; aplikacija ga za sada ne prikazuje (revizija: logopedi
u aplikaciji).

**503. `dodajURed`:** superadmin u komadima po 50 (redak potrošnje po komadu; pad usred ostavlja ranije komade, bez
limita je to prihvatljivo), logoped jedan atomski batch.

**504. „Novi passkey” samo za aktivnog logopeda** (`PozivOdbijen("neaktivan")`, gumb skriven). Deaktiviranog vraćaju
„Aktiviraj” ili opća pozivnica (odluka 205).

**505. U adresu nakon 303 idu samo `kvota=slike|zvukovi` i `kvota_n=<cijeli broj>`;** tekst poruke gradi AdminOkvir
na serveru iz trenutnog stanja. Nepoznata vrijednost se ignorira. Isti obrazac (tekst u URL-u, bez `role=alert`)
ostaje na `/admin/zvukovi?p=` i `/admin/nova-rijec?greska=`: nije bio nalaz, za kasnije.

**506. `LIMIT_MAX = 100_000` ostaje.** Logoped s ogromnim limitom mogao bi jednim zahtjevom upisati tisuće poslova u
jedan batch; limit postavlja samo superadmin, a zadano je 50/200. Revizija: prvi limit iznad 1000 ili pad batcha.
(potvrditi)

**507. Produkcija prije migracije (samo čitanje, 16. 11. 2026.):** `korisnici` 2 retka, oba `uloga='admin'`, nijedan
logoped (0032 nikoga ne deaktivira; stupac `aktivan` još ne postoji pa je upit iz odluke 105 grupiran samo po ulozi);
`aktivnost` 4134 retka (0033 ih prepisuje); `migrations list --remote`: na čekanju točno 0032 i 0033.

**508. Produkcija (16./17. 11. 2026., korisnikov „go” kroz orkestratora):** `npm run db:migrate` primijenio 0032 i
0033 bez greške (cijeli izlaz pročitan); poslije: `aktivnost` 4134 (isto kao prije), aktivnih korisnika 2, `pozivi` 0,
`ai_potrosnja` 0. `npm run deploy`: verzija `4ed58f25`. Smoke bez prijave prošao. Prijava passkeyem traži Touch ID,
a Access OTP kod iz e-maila: to radi korisnik, ne Claude.

**509. Pozivnice testerima izdaje korisnik sam** na `/admin/korisnici` i šalje ih ručno na WhatsApp; Claude ne izdaje
pozivnice i ne šalje poruke. Uvjet „oba testera prijavljena” iz plana se ne čeka. Odluka korisnika 16. 11. 2026.
