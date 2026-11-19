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
