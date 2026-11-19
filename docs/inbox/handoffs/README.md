# Handoffi: inbox za transakcijske mailove (S1–S4)

Plan je u `docs/inbox/plan.md`, odluke u `docs/inbox/decisions.md`, radna lista u `docs/inbox/TODO.md`.
„Nastavi inbox” znači prvi red koji nije „gotovo” u „Stanje lanca”; prompt je `SN.md`. Lanac se može vrtjeti i
kroz `/todo-plan-exec docs/inbox/handoffs`.

## Lanac

1. Sesija N počinje iz `docs/inbox/handoffs/SN.md` i radi svoj paket po pravilima ispod.
2. Na kraju: označi `SN` u „Stanje lanca” (commit, testovi, napomena) i stavke u `TODO.md`; ako je naučila nešto
   što mijenja kasnije pakete, uredi `S(N+1).md` (nedovršeno ide na **vrh**); u `S(N+1).md` upiše polazni commit i
   brojke testova; `/wrap-up` uzima **sadržaj `S(N+1).md`** kao handoff (`~/.claude/handoffs/logomedo.com/`).
3. Bez konteksta usred paketa: nastavak je opet `SN`, s ostatkom na vrhu. Broj se ne povećava.
4. **Vrata:** S2 traži korisnika za DNS/Resend dashboard ako API ne pokriva i za e2e odgovor iz pretinca;
   S4 za Google DKIM. Pitanje je na vrhu odgovarajućeg handoffa.

Handoff se mijenja samo prema naprijed.

## Stanje lanca

| Sesija | Paket | Stanje | Commit | Testovi | Napomena |
| --- | --- | --- | --- | --- | --- |
| S0 | Plan | gotovo | 24d60ee | 333 | plan, koda inboxa nema; odluke 1–10 |
| S1 | Istraživanje, temelj, webhook | gotovo | f9c1cec | 360 | research s izvorima; staging probni webhook zelen (200/401/401/duplikat); odluke 100–111 |
| S2 | Primanje na produkciji, e2e | gotovo | d3e8251 | 361 | poddomena zaseban Resend domain, MX/DKIM/webhook/secret na produkciji; pozivnica s Reply-To; e2e: odgovor iz Gmaila u razgovoru 1 s 2 privitka u R2, In-Reply-To = SES message_id; odluke 200–206 |
| S3 | `/admin/poruke`, odgovor, brzi odgovori | gotovo | faccd21 | 378 | e2e na produkciji 19. 11. (nit u Gmailu, odgovor natrag u razgovor 1, brzi odgovor); dodano: zaključan gumb + Idempotency-Key (312), polling novih poruka (313); odluke 300–313 |
| S4 | Retencija, obavijesti, SPF/DKIM, dokumentacija | gotovo | 70f4a0f | 395 | produkcija 495af0f7 + migracija 0040; e2e: obavijest o zahtjevu isporučena superadminima; `docs/inbox.md`; apex SPF s Googleom (uz korisnikov „da”); Google DKIM čeka korisnika (S5); odluke 400–406 |
| S5 | Google DKIM apexa | čeka korisnika | | | pitanje na vrhu `S5.md`; bez toga je lanac zatvoren |

## Zajednička pravila (svaka sesija)

- **Radna kopija:** `/Users/ms/git/logomedo/logomedo.com-landing`, grana `inbox`. Git uvijek s
  `git -C /Users/ms/git/logomedo/logomedo.com-landing`. `/Users/ms/git/logomedo/logomedo.com` (grana `main`) je
  radna kopija drugih sesija i lanac je ne dira.
- **Polazak:** `git fetch && git rebase origin/main`, pa `npm test && npm run check && npm run build` i jedna
  rečenica da je zeleno. Ako nije, prvo to popravi.
- **Grane i deploy:** commit na `inbox`, push `inbox`. Staging: `npm run deploy:staging` (staging naredbe uvijek
  `--env staging`, `docs/staging.md`). Produkcija (S2–S4): rebase, zeleno, `git push origin HEAD:main`, `npm run
  deploy`, pa `wrangler deployments list` (druga sesija možda deploya odmah poslije). Migracija na produkciji:
  `CLOUDFLARE_ACCOUNT_ID=7dc7167b7e2e00923bfa7cd697df14e4`.
- **Opseg:** `src/lib/poruke.ts`, `src/lib/svix.ts`, `src/lib/email.ts`, `emails/`, `src/pages/api/resend/`,
  `src/pages/admin/poruke*`, nova migracija, bočna traka admina, `/privatnost` (samo odlomak o dopisivanju).
  Ostatak aplikacije samo kad paket to traži.
- **Javni repo:** nikakvi stvarni e-mailovi, sadržaj poruka, ključevi ni secreti u gitu, fixtureima ni commit
  porukama. Fixturei koriste `primjer.test`.
- **Orkestracija:** Opus 5.5 subagenti, `effort` eksplicitno (`high` kod, `medium` čitanje), najviše 2 paralelno;
  Fable samo uz korisnikov izričit pristanak. Agenti ne diraju `docs/inbox/TODO.md`, `plan.md` ni handoffe.
- **Testovi:** bez mreže (fetch se ubacuje), svježa D1 po testu (`src/lib/test/d1.ts`), `skipped 0`.
- **Vanjske radnje:** pravi mail šalji samo na korisnikove adrese i samo kad paket to kaže; DNS mijenjaj samo
  zapise na `poruke.logomedo.com`. Cloudflare DNS se mijenja kroz dashboard u Braveu (wrangler OAuth nema DNS
  pravo); browser po `~/.claude/CLAUDE.md` (Brave, `ms@ff.hr`). Resend ključ: `wrangler secret` ga ne vraća, pa
  ga za API pozive korisnik da u clipboard.
- **Brojke s naredbom**, odluke u svom bloku, commit svakog zelenog koraka, ~150k konteksta zatvori sesiju.
  Bez Monitora za napredak. Istraživanja u `docs/inbox/research/YYYY-MM-DD-*.md`.
