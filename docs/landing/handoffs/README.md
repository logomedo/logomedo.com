# Handoffi: landing stranice + staging (S1–S6)

Plan je u `docs/landing/plan.md`, odluke u `docs/landing/decisions.md`, radna lista u
`docs/landing/TODO.md`. „Nastavi landing” znači prvi red koji nije „gotovo” u „Stanje lanca”;
prompt je `SN.md`. Lanac se može vrtjeti i kroz `/todo-plan-exec docs/landing/handoffs`.

## Lanac

1. Sesija N počinje iz `docs/landing/handoffs/SN.md`.
2. Sesija N radi svoj paket po pravilima ispod.
3. Na kraju sesija N:
   - označi `SN` u „Stanje lanca” (commit, testovi, napomena) i stavke u `TODO.md`;
   - **ako je naučila nešto što mijenja kasnije pakete, uredi `S(N+1).md`** (i po potrebi plan).
     Nedovršeni dio paketa N ide na **vrh** `S(N+1).md`;
   - u `S(N+1).md` upiše polazni commit, granu i brojke testova;
   - pozove `/wrap-up`; handoff prompt je **sadržaj `S(N+1).md`**
     (u clipboard i `~/.claude/handoffs/logomedo.com/`).
4. Bez konteksta usred paketa: nastavak je opet `SN`, s popisom ostatka na vrhu. Broj se ne povećava.
5. **Vrata:** S6 ne radi produkciju dok korisnik u toj sesiji ne kaže „go”. Pitanje je na vrhu `S6.md`.

Handoff se mijenja samo prema naprijed: gotovi `SN` se ne prepisuju.

## Stanje lanca

| Sesija | Paket | Stanje | Commit | Testovi | Napomena |
| --- | --- | --- | --- | --- | --- |
| S0 | Plan | gotovo | 26e55c6 | 276 | plan, koda nema; odluke 1–17 |
| S1 | Staging | gotovo | 8566e75 | 294 | staging.logomedo.com iza lozinke, kopija produkcijske D1; odluke 100–106 |
| S2 | Inventura i tekstovi | gotovo | ed07514 | 287 | `sadrzaj.md` (6 stranica + 404, bez `/aplikacija`), inventura; staging bez Basic Autha (odluka 207); odluke 200–212 |
| S3 | Kostur i naslovna | gotovo | a5cd7f3 | 296 | `src/landing/`, naslovna, kosturi podstranica, `_headers`, SEO, OG; staging `607dd115`, provjera 89/0; odluke 300–308 |
| S4 | Snimke, katalog, radni listići | otvoreno | | | |
| S5 | Ostale stranice | otvoreno | | | |
| S6 | Pregled, **vrata**, produkcija | otvoreno | | | |

## Zajednička pravila (svaka sesija)

- **Radna kopija (odluka 18):** lanac radi isključivo u worktreeju
  `/Users/ms/git/logomedo/logomedo.com-landing` (grana `landing`). Git uvijek
  `git -C /Users/ms/git/logomedo/logomedo.com-landing`. `/Users/ms/git/logomedo/logomedo.com` je
  radna kopija druge sesije i lanac je ne dira (ni `git switch`, ni build, ni deploy odande).
- **Polazak:** `git fetch && git rebase origin/main` (konflikt riješi ili stani), pa
  `npm test && npm run check && npm run build`, i jedna rečenica da je zeleno. Ako nije, prvo to popravi.
- **Grane:** sve sesije commitaju na `landing` i pushaju `landing`. S1 (staging) na kraju objavi i
  u `main`: `git push origin HEAD:main` nakon rebasea (fast-forward). S2–S5 nikad ne pushaju u `main`.
  S6 nakon „go” isto kao S1.
- **Opseg:** samo `logomedo.com/`. `../app` i `../preuzimanje` se ne diraju. Admin, API i
  `src/lib/` se ne mijenjaju osim onoga što paket izričito traži (S1: zaštita staginga).
- **Produkcija:** `npm run deploy`, `npm run db:migrate`, `wrangler secret put` bez `--env staging`
  i bilo kakvo pisanje u produkcijsku D1 ili R2 zabranjeni su do „go” u S6 (odluka 16). Svaka
  wrangler naredba koja nije čitanje ima `--env staging` ili ide kroz `npm run …:staging`.
- **Javni repo:** nikakvi e-mailovi, imena logopeda i testera, lozinka staginga, tokeni, linkovi
  pozivnica, ni u kodu, ni u testovima, ni u dokumentima, ni na snimkama zaslona. Dump D1 samo u
  `~/.cache/logomedo-staging/`.
- **Orkestracija:** posao rade Opus 5.5 subagenti (`model: "opus"`), glavna sesija orkestrira.
  Paket razbij na (a) implementaciju i (b) provjeru (testovi, staging, `curl`, Playwright).
  `effort` uvijek eksplicitno (`high` za kod, `medium` za čitanje i tekst). Najviše 2 agenta
  paralelno; u pravilu jedan za drugim. Fable samo uz korisnikov pristanak.
- **Agentima zabrani** `docs/landing/TODO.md`, `plan.md`, `decisions.md` i handoffe. Orkestrator
  ih ažurira; agent odluke predlaže u izvještaju.
- **Čitanje:** `grep` i `sed -n`, ne cijele datoteke; datoteku ne čitati dvaput.
- **Testovi:** `node --test`, bez mreže, `skipped 0`. Provjere staginga su odvojene skripte
  (`scripts/landing-provjera.sh`), ne dio `npm test`.
- **Trošak:** ne pokretati `scripts/runner.sh`, Vertex ni ElevenLabs. Ilustracije za landing
  uzimaju se iz postojećeg kataloga (`cdn.logomedo.com`) ili `public/`. Nove generirane slike samo
  uz korisnikov pristanak. Nikad `claude -p` petlja.
- **Brojke** samo s naredbom koja ih je dala.
- **Paralelne sesije:** u radnoj kopiji mogu biti tuđe necommitane izmjene. Stageaj poimence
  (nikad `git add -A`). Deploy staginga iz čistog stabla; ako nije čisto, iz worktreea na HEAD-u
  (`git worktree add --detach <scratchpad>/wt HEAD`, symlink `node_modules`).
- **Autonomno:** odluči sam i zapiši odluku (blok sesije). Svaki zeleni korak commitaj, trailer
  `Co-Authored-By` po pravilima sesije. Push je dio wrap-upa.
- **Pitanja orkestratoru** (`/todo-plan-exec`): samo kad nešto stvarno ne možeš odlučiti
  (npr. nedostaje Cloudflare ovlast). Uz pitanje daj preporuku.
- **Token budget:** bez Monitora za napredak; dugi poslovi s `run_in_background`, javi se na kraju.
  Oko 150k konteksta orkestratora zatvori sesiju po koraku 3 lanca.
- **Istraživanja i mjerenja** u `docs/landing/research/YYYY-MM-DD-*.md`.
- **Pravila repoa:** `CLAUDE.md` (`npm test && npm run check && npm run build` prije commita),
  `docs/admin.md` (Access, lokalna sesija, zamka `CLOUDFLARE_ACCOUNT_ID`).
