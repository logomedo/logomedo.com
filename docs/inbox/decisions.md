# Odluke: inbox za transakcijske mailove

Svaka odluka ima broj, datum, razlog i uvjet revizije kad nije očit. Odluka se ne briše: nova je zamjenjuje i to
kaže. Blokovi: S0 1–99, S1 100–199, S2 200–299, S3 300–399, S4 400–499.

## S0 (19. 11. 2026.)

1. **Opseg:** odgovori na mailove koje šalje aplikacija, spremanje u D1/R2, `/admin/poruke` za superadmina, odgovor
   iz admina, brzi odgovori, obavijesti superadminu. Nije u opsegu: masovni mailovi, newsletter, logoped koji vidi
   svoje poruke u aplikaciji (moguće kasnije).
2. **Resend za slanje i primanje** (nastavak odluke 625 landinga). Cloudflare Email Routing se ne uključuje, jer
   bi preuzeo apex MX koji je Googleov.
3. **Poddomena `poruke.logomedo.com`** za primanje. Apex MX/SPF se ne dira. Revizija: ako Resend ne podržava
   primanje na poddomeni verificirane domene, S1 predlaže `poruke.logomedo.com` kao zasebnu Resend domenu.
4. **Nit po adresi** `odgovor+<kljuc>@poruke.logomedo.com`, ključ nasumičan (≥ 16 bajtova, base32, bez PII);
   `In-Reply-To`/`References` su rezerva, e-mail pošiljatelja zadnja. Nepoznat ključ i nepoznat pošiljatelj: novi
   razgovor „neraspoređeno”, ništa se ne baca.
5. **Tijelo poruke se dohvaća** `GET /emails/receiving/{id}` (webhook nosi samo metapodatke). Sprema se `text` i
   `html`; HTML se u adminu prikazuje u `iframe sandbox` bez skripti, uz tekst kao zadani prikaz.
6. **Privitci u R2** (`SLIKE`, prefiks `poruke/`, privatno), preuzimanje samo kroz admin rutu. Granica veličine i
   tipova odlučuje S1.
7. **Webhook potpis:** Svix (`svix-id`, `svix-timestamp`, `svix-signature`), ručno kroz WebCrypto, bez npm `svix`.
8. **Staging bez slanja i primanja** (kao odluka 625): testira se fixtureima i potpisom s testnim tajnim ključem.
9. **Predlošci u React Emailu** (`emails/*.tsx` → `npm run emails`), isti `Okvir.tsx` za sve mailove.
10. **Grana `inbox`** u worktreeju `/Users/ms/git/logomedo/logomedo.com-landing`; deploy na produkciju iz te
    radne kopije nakon `git push origin HEAD:main` (fast-forward, nakon rebasea na `origin/main`).

## S1 (19. 11. 2026.)

100. **Istraživanje** u `research/2026-11-19-resend-primanje.md`, izvor uz svaku tvrdnju. Polazni sažetak S0 je
     točan; webhook nosi i `cc`, `received_for`, a privitci `content_disposition`, `content_id`.
101. **Svix tolerancija 5 min** u oba smjera (dokumentacija ne daje broj; toliko koristi Svix biblioteka).
     Potpis se uspoređuje kroz `crypto.subtle.verify` (konstantno vrijeme); prihvaća se bilo koji `v1` iz popisa.
     Oba službena vektora (Svix manual, `webhook.test.ts`) su u `src/lib/svix.test.ts`.
102. **Webhook bez `RESEND_WEBHOOK_SECRET` vraća 503**, ne 401: nepostavljen secret je greška postave, a 503 Svix
     ponavlja. Neispravan potpis 401, ostale vrste događaja 200 bez upisa, neispravan JSON 400.
103. **Granice privitaka:** do 10 MB po privitku, 25 MB ukupno po poruci. Dopušteni tipovi: slike (jpeg, png, gif,
     webp, heic/heif), PDF, običan tekst, audio (mp3, m4a/mp4, aac, ogg, wav, webm), Word, Excel, ODT/ODS. Ostalo
     (video, izvršne, HTML, SVG, arhive) ostaje kao red u `privitci` bez `r2_kljuc`, s napomenom, da superadmin
     zna da je stiglo. Resend sam ne navodi granicu dolaznog maila. Revizija: kad logopedi počnu slati video.
104. **Tekst do 200 000 znakova** (skraćuje se, napomena), **HTML do 600 000** (inače se ne sprema, ostaje tekst):
     red D1 ima granicu 2 MB. Tijelo se dohvaća s `html_format=cid`, pa ugrađene slike ostaju privitci u R2
     (`content_id` u `privitci`) i S3 ih prikazuje kroz admin rutu.
105. **Redoslijed u webhooku:** sve što može pasti (Resend API, skidanje privitaka, R2) ide prije upisa u D1 i
     vraća 502, pa Svix ponovi; R2 ključ `poruke/<email_id>/<attachment_id>` je deterministički, pa ponovljeni
     upis samo prepiše isti objekt. Upis u D1 (novi razgovor, poruka, privitci, brojač) je jedan batch;
     dvostruki `email_id` pada na `UNIQUE(resend_id)` i vraća „duplikat” bez praznog razgovora.
106. **Potpisani `download_url` privitka zove se bez Resend ključa** (CloudFront URL ne smije dobiti bearer).
107. **Nepoznat ključ u adresi** nije greška: traži se dalje po referencama i pošiljatelju (odluka 4). Ključ je
     26 znakova base32 (128 bita); adresa se uspoređuje bez obzira na velika slova.
108. **`References` se uspoređuju sa svim `message_id` u `poruke`** (dolaznim i odlaznim), jer Message-ID našeg
     odlaznog maila Resend ne vraća (otvoreno pitanje za S2/S3 u research §3).
109. **`neprocitano` se računa iznova** (`COUNT` dolaznih bez `procitano_at`) pri svakom upisu, ne inkrementira,
     pa ponovljeni ili izgubljeni upis ne pokvari brojač. Zatvoren razgovor se dolaznom porukom opet otvara;
     `nerasporedjen` ostaje dok ga superadmin ne razvrsta (S3).
110. **Ruta `/api/resend/webhook`** prolazi middleware bez izmjene: nije pod `/admin` ni `/api/v1`, pa nema sesije
     ni Origin provjere, a Astro `checkOrigin` gleda samo obrasce (`application/json` ne). Logika je u
     `src/lib/poruke-webhook.ts` (fetch se ubacuje u testovima), ruta je jedan red.
111. **Testni webhook secret staginga** je lokalno u `~/.cache/logomedo-staging/inbox-webhook-secret` (izvan gita),
     a `scripts/inbox-probni-webhook.ts` ga čita iz okruženja.

## S2 (19. 11. 2026.)

200. **`poruke.logomedo.com` je zaseban Resend domain objekt** (`POST /domains`, `eu-west-1`, `sending: disabled`,
     `receiving: enabled`), ne prekidač na `logomedo.com`: primanje na `logomedo.com` bi tražilo apex MX, koji je
     Googleov (odluka 3). API je odmah vratio dva zapisa, oba na poddomeni: TXT `resend._domainkey.poruke` (DKIM)
     i MX `poruke` → `receive-euw1.forge.rmta.net`, prioritet 10. Dodani u Cloudflare dashboardu (DNS only); apex
     MX (5 Googleovih) nije diran. Dashboard Resenda nije trebao.
201. **Webhook kroz API** (`POST /webhooks`, samo `email.received`, endpoint `https://logomedo.com/api/resend/webhook`);
     `signing_secret` je išao cijevi ravno u `wrangler secret put RESEND_WEBHOOK_SECRET`, nije ispisan ni spremljen.
     Resend API ključ za logomedo.com je lokalno u `~/.config/logomedo/secrets.env` (chmod 600, izvan repoa);
     `~/.config/bizops/secrets.env` je drugi Resend račun (domovina.ai) i ne koristi se.
202. **Pozivnica otvara razgovor prije slanja** (`noviRazgovor`, predmet = naslov maila), šalje s `reply_to`
     `odgovor+<kljuc>@poruke.logomedo.com` i nakon uspjeha upisuje odlaznu poruku (`poslao: null`). Neuspjelo slanje
     briše prazan razgovor (`obrisiPrazanRazgovor`). Ako D1 padne prije slanja, pozivnica ipak ide, s rezervnim
     `reply_to` `bok@logomedo.com`: pozivnica je važnija od niti. `Message-ID` se ne postavlja dok e2e ne pokaže
     što Resend radi sa zaglavljima (research §3).
203. **Kopija pozivnice u D1 je bez tokena** (poveznica zamijenjena s `SKRIVENA_POVEZNICA`): token vrijedi do isteka
     i ne smije ležati u `poruke`, koje čita admin sučelje i backup. Revizija: nikad za tokene.
204. **Rok čuvanja dopisivanja 24 mjeseca od zadnje poruke** u razgovoru, u `src/lib/poruke-rokovi.ts`
     (`PORUKE_ROK_MJESECI`), isti broj za `/privatnost` i retenciju u S4. (potvrditi) Konzervativno usklađeno s
     „dok traje suradnja”; korisnik može skratiti promjenom jedne konstante.
205. **`/privatnost`**: nova sekcija `#dopisivanje` iza `#pristup` (što se sprema, tko vidi, svrha i osnova čl. 6.
     st. 1. t. (b) i (f), rok, Resend u EU); Resend dodan u `#obradivaci` (već je slao pozivnice, a nije bio
     naveden); `#cuvanje` razdvaja odgovore u LogoMedu od pošte na `bok@`.
206. **Niti preko SES `message_id`** (e2e 19. 11.): `GET /emails/{id}` odlaznog maila vraća `message_id`
     `<…@eu-west-1.amazonses.com>`, a Gmailov odgovor ga nosi u `In-Reply-To` i `References`; webhook je odgovor
     smjestio u razgovor pozivnice po ključu u adresi. Zato vlastiti `Message-ID` ne postavljamo: S3 nakon slanja
     dohvati i spremi `message_id` i iz njega složi `In-Reply-To`/`References`. Gmail je obične privitke poslao s
     `content_id`, pa `content_id` sam ne znači ugrađenu sliku (S3, prikaz).

## S3 (19. 11. 2026.)

300. **Odgovor iz admina šalje `LogoMedo <bok@logomedo.com>`** (javna kontakt adresa), s `reply_to` razgovora; logopedov
     odgovor tako ide u D1, ne u Gmail. Primatelj je `Ime <email>` razgovora.
301. **Zaglavlja niti:** `In-Reply-To` = `message_id` zadnje dolazne; bez nje zadnja odlazna s poznatim `message_id`
     (npr. pozivnica); `References` = reference te poruke + taj id (zadnjih 20). Bez ijednog `message_id` zaglavlja se
     ne šalju (nit u D1 i dalje drži ključ u adresi). Predmet `Re: …` bez gomilanja `Re:/Odg:/AW:`.
302. **`message_id` odlazne se dohvaća odmah** (`GET /emails/{id}`, `dohvatiMessageId`), uz jedan ponovljeni pokušaj
     nakon 1,5 s; isto i pozivnica. Ako ga nema, ostaje `null`: nit u D1 to ne kvari (ključ, odluka 4).
303. **U D1 se za odgovor sprema `text` = samo ono što je superadmin napisao** (bez okvira i citata, za čitljivu nit), a
     `html` = poslani HTML. Pozivnica ostaje kako je bila (odluka 203).
304. **Upis nakon slanja ne poništava slanje:** mail je otišao, greška upisa ide u log samo s Resend id-jem (bez
     sadržaja). Neuspjelo slanje i staging bez ključa ne upisuju ništa i zadržavaju nacrt u obrascu.
305. **Odgovor razvrstava razgovor** (`nerasporedjen` → `otvoren`, u `spremiOdlaznu`); ručno: „Zatvori”, „Otvori
     ponovno”, „Razvrstaj kao otvoren”. Otvaranje razgovora označava dolazne pročitanima.
306. **HTML poruke u `iframe sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"`**, bez
     `allow-scripts`, kroz `srcdoc` s `<base target="_blank">`. srcdoc nasljeđuje CSP stranice, pa se vanjske slike
     (trackeri) ne učitavaju (provjereno u Chromeu). `allow-same-origin` treba za `cid:` slike (kolačić sesije) i za
     mjerenje visine okvira; bez skripti u okviru to ne otvara ništa. Tekst je zadani prikaz; HTML je otvoren samo kad
     teksta nema.
307. **Ugrađene slike:** `cid:` se prepisuje u `/admin/poruke/privitak/<id>?prikaz=1` samo za privitke spremljene u R2
     čiji se `content_id` pojavljuje u HTML-u; svi privitci su i u popisu („u tekstu” uz ugrađene). Ruta je zadano
     `attachment`, `inline` samo uz `?prikaz=1` i samo za jpeg/png/gif/webp.
308. **Citati:** `razdvojiCitat` reže na prvoj liniji s `>` ili uvodu citata (Gmail „On … wrote:”, i prelomljen u dva
     retka, „… je napisao/la:”, Outlook „-----Original Message-----”/„From:”). Nit prikazuje tekst, citat je u
     „Citirani tekst”; isječak u popisu i citat u odgovoru su bez citata.
309. **Citat u odgovoru:** do 12 redaka i 700 znakova, uvod `d. m. gggg. hh:mm, Ime <email>:` (bez rodnog „napisao/la”).
310. **Brzi odgovori:** kratica `[a-z0-9čćđšž_-]{1,30}` (upisuje se bez `/`, jedinstvena), naslov do 120, tekst do
     5000 znakova. `/kratica` + Tab umeće samo na početku ili iza razmaka (adresa `x/link` ne okida); izbornik umeće
     na kursor s praznim redom. Logika je u `src/lib/poruke-klijent.ts` (testirana), stranica je uvozi iz `<script>`:
     Astro mali bundle umetne u stranicu, a middleware mu da nonce; inline handlera nema.
311. **Provjera izgleda admina bez produkcijske prijave:** lokalni `astro dev` s privremenim `.dev.vars`
     (`ADMIN_EMAILS` testna adresa), sesija u lokalnom D1, privitci `wrangler r2 object put --local`, pa
     `playwright-core` sa sustavnim Chromeom i zaglavljem `Cookie` (`addCookies` odbija `__Host-` kolačić na http).
     Za razliku od statične kopije, to provjerava i CSP, iframe i skripte.
312. **Dvostruko slanje odgovora (zahtjev korisnika nakon e2e):** obrazac nosi jednokratni `kljuc` (`crypto.randomUUID()` pri
     renderu), koji ide u Resend `Idempotency-Key` (`odgovor-<razgovor>-<kljuc>`, 24 h). Ponovljeni POST dobije isti
     id i ne upisuje se dvaput (`porukaPoResendId`), a istodobni dobije 409 `concurrent_idempotent_requests` → „u tijeku”
     (redirect s porukom, ništa se ne upisuje). U pregledniku se gumb odmah zaključa (`aria-busy`, vrtilica, „Šaljem…”),
     drugi submit se ignorira, a `pageshow` iz bfcachea ga otključa.
313. **Nove poruke bez ručnog osvježavanja (zahtjev korisnika nakon e2e):** zasad polling, ne WebSocket ni Durable
     Objects. `GET /admin/poruke/stanje[?razgovor=id]` vraća samo potpis (zadnji id poruke; za popis i broj
     nepročitanih), bez sadržaja. `src/lib/poruke-pracenje.ts` ga dohvaća svakih 12 s dok je kartica vidljiva (i odmah
     kad postane vidljiva). Kad se potpis promijeni, popis se osvježi, a nit se osvježi tek nakon što se nacrt odgovora
     spremi u `sessionStorage` i poslije vrati; dok slanje traje, nit se ne osvježava. Trošak: jedan mali D1 upit po
     otvorenoj kartici svakih 12 s.

## S4 (19. 11. 2026.)

400. **Retencija** (`src/lib/poruke-retencija.ts`, `pocistiPoruke`): pri otvaranju `/admin/poruke` (kao `pocisti()` za
     zahtjeve, bez crona) brišu se razgovori kojima je zadnja poruka starija od `PORUKE_ROK_MJESECI` (24), sa svim
     porukama, privitcima u D1 i R2 i redom u `obavijesti`, te razgovori bez ijedne poruke stariji od 24 h (ostatak
     neuspjele pozivnice). Prvo R2, pa D1 u jednom batchu: ako R2 padne, D1 ostaje i sljedeće otvaranje ponovi. Brisanje
     po tablicama, ne kroz `ON DELETE CASCADE`. Najviše 200 razgovora po otvaranju. Greška ne ruši popis.
401. **Obavijest superadminu** (`src/lib/obavijesti.ts`, `emails/Obavijest.tsx`): šalje `LogoMedo <obavijesti@logomedo.com>`
     (domena je već verificirana u Resendu), `reply_to` `bok@logomedo.com`, na sve adrese iz `ADMIN_EMAILS` u jednom mailu.
     Mail nema ime, adresu ni sadržaj, samo link (`/admin/poruke/<id>` ili `/admin/zahtjevi`): ide u vanjski pretinac,
     a sve ostalo je iza prijave. Najviše jedna na sat po razgovoru, odnosno jedna na sat za sve zahtjeve (tablica
     `obavijesti`, migracija 0040, atomski upsert s uvjetom); neuspjelo slanje oslobađa mjesto. Ne baca: webhook i
     `/pristup` nikad ne padnu zbog obavijesti. Zahtjev koji se nije upisao (otvoreni za isti e-mail, honeypot) ne
     obavještava. Mijenja odluku 710 landinga (umjesto Cloudflare Email Servicea ide Resend). (potvrditi: bez imena)
402. **Novi razgovor iz admina** (`/admin/poruke/novi`, `posaljiNoviRazgovor` u `src/lib/email.ts`): e-mail, ime, predmet,
     poruka; polja se mogu predati kroz `?email=&ime=&predmet=`. Gumb „Napiši” na `/admin/zahtjevi` i „Novi razgovor” na
     `/admin/poruke`. Šalje kroz `posaljiOdgovor` (`prvi: true`): predmet bez „Re:”, bez citata i `In-Reply-To`,
     `Idempotency-Key` `novi-<ključ obrasca>` (ne ovisi o id-ju razgovora). Ponovljeni POST vraća razgovor već poslanog
     maila i briše prazan novi; neuspjeh briše prazan razgovor. `/admin/korisnici` zasad nema poveznicu (dodati po potrebi).
403. **E2e na produkciji** (verzija `495af0f7`): probni zahtjev na `/pristup` (adresa `@primjer.test`) → Resend
     „Novi zahtjev za pristup LogoMedu” `delivered`, 3 primatelja (ADMIN_EMAILS); probni zahtjev i red `obavijesti`
     zatim obrisani. Grana obavijesti iz webhooka (nova poruka) pokrivena je testom; na produkciji se vidi pri prvom
     sljedećem stvarnom odgovoru.
404. **Rok čuvanja 24 mjeseca** od zadnje poruke ostaje (odluka 204; pitanje u S4 bez odgovora korisnika u roku). (auto, potvrditi)
405. **SPF apexa uključuje Google** (korisnikov „da” kroz orkestratora, 19. 11.): u Cloudflare dashboardu (Brave)
     zapis `v=spf1 include:_spf.firebasemail.com ~all` promijenjen u
     `v=spf1 include:_spf.google.com include:_spf.firebasemail.com ~all` (provjereno `dig @1.1.1.1` i `@8.8.8.8`);
     ništa drugo u zoni nije dirano. Firebase ostaje dok se ne potvrdi da stari app više ne šalje. **Google DKIM čeka
     korisnika** (`google._domainkey.logomedo.com` ne postoji; generira se u Google Adminu): koraci su na vrhu
     `handoffs/S5.md`. DMARC ostaje `p=none`.
406. **Resend API ključ logomedo.com je lokalno** u `~/.config/logomedo/secrets.env` (odluka 201 vrijedi; S4 ga je
     koristio samo za `GET /emails`, bez ispisa).
