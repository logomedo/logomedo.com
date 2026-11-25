# Handoffi: angažman (S1–S7)

Plan je u `docs/angazman/plan.md`, odluke u `docs/angazman/decisions.md`, radna lista u `docs/angazman/TODO.md`.
„Nastavi angažman” (ili „nastavi podsjetnike / streak”) znači prvi red koji nije „gotovo” u „Stanje lanca”; prompt je
`SN.md`. Lanac se može vrtjeti i kroz `/todo-plan-exec docs/angazman/handoffs`.

## Lanac

1. Sesija N počinje iz `docs/angazman/handoffs/SN.md` i radi svoj paket po pravilima ispod.
2. Na kraju: označi `SN` u „Stanje lanca” (commit, testovi, napomena) i stavke u `TODO.md`; ako je naučila nešto što
   mijenja kasnije pakete, uredi `S(N+1).md` (nedovršeno ide na **vrh**); u `S(N+1).md` upiše polazni commit i brojke
   testova; `/wrap-up` uzima **sadržaj `S(N+1).md`** kao handoff (`~/.claude/handoffs/logomedo.com/`).
3. Bez konteksta usred paketa: nastavak je opet `SN`, s ostatkom na vrhu. Broj se ne povećava.
4. **Vrata:** nakon S4 korisnik (i Anita za ton) odobrava tekstove mailova i odlomak `/privatnost`; S7 (produkcija)
   ne počinje bez tog „da” i bez korisnikova naloga za uključivanje. Pitanje je na vrhu `S7.md`. S5 i S6 smiju ići
   dok se čeka, jer su samo staging.

Handoff se mijenja samo prema naprijed.

## Stanje lanca

| Sesija | Paket | Stanje | Commit | Testovi | Napomena |
| --- | --- | --- | --- | --- | --- |
| S0 | Plan | gotovo | 3344de1 | 460 | plan, koda nema; odluke 1–12 |
| S1 | Lijevak, istraživanje, revizija segmenata | | | | |
| S2 | `aktivni_dani`, bilježenje, backfill | | | | |
| S3 | Cron, segmenti, slanje, odjava, predlošci | | | | |
| S4 | Uprava: podsjetnici, Postavke, nacrt `/privatnost` | | | | vrata nakon |
| S5 | Niz (streak) | | | | |
| S6 | Ljestvica | | | | |
| S7 | Produkcija | | | | vrata |

## Zajednička pravila (svaka sesija)

- **Radna kopija:** `/Users/ms/git/logomedo/logomedo.com-landing`, grana `angazman` (S1 je napravi iz `origin/main`).
  Git uvijek s `git -C /Users/ms/git/logomedo/logomedo.com-landing`. `/Users/ms/git/logomedo/logomedo.com` (grana
  `main`) je radna kopija drugih sesija i lanac je ne dira.
- **Polazak:** `git fetch && git rebase origin/main`, pa `npm test && npm run check && npm run build` i jedna rečenica
  da je zeleno. Ako nije, prvo to popravi.
- **Grane i deploy:** commit na `angazman`, push `angazman`. Staging: `npm run deploy:staging` (staging naredbe uvijek
  `--env staging`, `docs/staging.md`); prije deploya `wrangler deployments list --env staging` jer i druge sesije
  deployaju staging, a poslije javi koju si verziju pregazio. Migracije na stagingu:
  `CLOUDFLARE_ACCOUNT_ID=7dc7167b7e2e00923bfa7cd697df14e4 npx wrangler d1 migrations apply logomedo-staging --remote --env staging`.
  Produkcija (`main`, `npm run deploy`, migracije na `logomedo`) **samo u S7**.
- **Brojevi migracija:** prije nove migracije `ls migrations | tail -3` na `origin/main` (paralelne sesije dodaju
  svoje); uzmi sljedeći slobodan broj u trenutku rebasea, ne broj iz plana.
- **Opseg:** `src/lib/angazman/`, `src/worker.ts` (samo `scheduled`), `wrangler.jsonc` (triggers, var
  `PODSJETNICI`), `emails/Podsjetnik*.tsx`, nove migracije, `src/pages/admin/uprava/podsjetnici*`, Postavke (odjeljak
  podsjetnika, niza, ljestvice), traka admina, `/odjava-podsjetnika`, mjesta gdje se zove `zabiljeziDan` (jedna linija
  po radnji). `/privatnost` samo kao nacrt u S4, objava tek nakon vrata.
- **Javni repo:** nikakvi stvarni e-mailovi, imena, sadržaj zadataka, ključevi ni secreti u gitu, fixtureima,
  `research/` ni commit porukama. Brojke samo zbirno. Fixturei koriste `primjer.test`.
- **Mailovi:** pravi mail samo na adrese iz `ADMIN_EMAILS` s +aliasom (staging ih ionako jedine pušta) i samo kad
  paket to kaže. Na stagingu `PODSJETNICI` počinje kao `suho`; `ukljuceno` samo za e2e s testnim korisnicima na
  +aliasima, i nakon toga natrag `suho`. Tekstovi kratki, hrvatski, bez tehničkog žargona (kao poruke Aniti).
- **Orkestracija:** Opus 5.5 subagenti, `effort` eksplicitno (`high` kod, `medium` čitanje), najviše 2 paralelno;
  Fable samo uz korisnikov izričit pristanak. Agenti ne diraju `docs/angazman/TODO.md`, `plan.md` ni handoffe.
- **Testovi:** bez mreže (fetch se ubacuje), svježa D1 po testu (`src/lib/test/d1.ts`), `skipped 0`; vrijeme se
  ubacuje (`sada`), nikad `Date.now()` u pravilima.
- **Browser** (e2e na stagingu): Brave, `ms@ff.hr`, po `~/.claude/CLAUDE.md`; prijava na staging po memoriji
  projekta (Access gumb, passkey).
- **Brojke s naredbom**, odluke u svom bloku, commit svakog zelenog koraka, ~150k konteksta zatvori sesiju. Bez
  Monitora za napredak. Istraživanja u `docs/angazman/research/YYYY-MM-DD-*.md`.
