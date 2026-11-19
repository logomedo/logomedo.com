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
