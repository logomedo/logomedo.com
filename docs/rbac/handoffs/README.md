# Handoffi: RBAC lanac S1–S5

Plan je u [../plan.md](../plan.md), odluke u [../decisions.md](../decisions.md), radna lista u
[../TODO.md](../TODO.md). Korisnik nakon `/clear` kaže „nastavi RBAC” (ili „nastavi zadnji handoff”):
to je prvi red koji nije „gotovo” u „Stanje lanca”.

## Lanac

1. Sesija N počinje iz `docs/rbac/handoffs/SN.md`.
2. Sesija N radi svoj paket po pravilima ispod.
3. Na kraju sesija N:
   - označi `SN` u „Stanje lanca” (commit, testovi, napomena) i stavke u `TODO.md`;
   - **ako je naučila nešto što mijenja kasnije pakete, uredi `S(N+1).md`** (i po potrebi plan).
     Nedovršeni dio paketa N ide na **vrh** `S(N+1).md`;
   - u `S(N+1).md` upiše polazni commit i brojke testova;
   - pozove `/wrap-up`; handoff prompt je **sadržaj `S(N+1).md`**
     (u clipboard i `~/.claude/handoffs/logomedo.com/`).
4. Bez konteksta usred paketa: nastavak je opet `SN`, s popisom ostatka na vrhu. Broj se ne povećava.
5. **Vrata:** S5 ne radi produkciju dok korisnik u toj sesiji ne kaže „go”. Pitanje je na vrhu `S5.md`.

Handoff se mijenja samo prema naprijed: gotovi `SN` se ne prepisuju.

## Stanje lanca

| Sesija | Paket | Stanje | Commit | Testovi | Napomena |
| --- | --- | --- | --- | --- | --- |
| S0 | Plan | gotovo | 5f441e1 | 111 | plan, koda nema; odluke 1–13 |
| S1 | Harness, migracija 0032, ovlasti, uloga u sesiji | gotovo | d10369e | 153 | migracije 33/33 u node:sqlite; do S3 logoped vidi cijeli admin (odluka 107); odluke 100–108 |
| S2 | Pozivnica, `/admin/korisnici` | gotovo | b46c02f | 176 | migracija 0033 (rebuild `aktivnost`, prije produkcije COUNT); e2e `scripts/e2e-poziv.sh` prolazi; odluke 200–211 |
| S3 | Ovlasti na rutama, vlasništvo, UI po ulozi | gotovo | 66e16a9 | 199 | `rute.ts` + rewrite 403, `vlasnistvo.ts` (tuđe 404), aktivnost bez administracije; e2e proširen i prolazi; odluke 300–310 |
| S4 | AI kvota, `rijeci.dodao`, pregled po korisniku | gotovo | e89f432 | 218 | `kvota.ts` (NOT NULL poništava batch), sve točke troška u `research/2026-11-16-tocke-troska.md`, poruka u middlewareu; e2e korak 3c prolazi; odluke 400–412 |
| S5 | Review, docs, **vrata**: produkcija i pozivnice | gotovo | 0337ba3 | 224 | review 10 nalaza (odluke 500–507), 0032+0033 migrirane, deploy `4ed58f25`, smoke bez prijave; prijavu i pozivnice radi korisnik |

## Zajednička pravila (svaka sesija)

- **Polazak:** u `logomedo.com/` `npm test && npm run check && npm run build`, i jedna rečenica da
  je zeleno. Ako nije, prvo to popravi. Git uvijek `git -C /Users/ms/git/logomedo/logomedo.com`.
- **Opseg:** samo `logomedo.com/`. `../app` i `../preuzimanje` se ne diraju; `../preuzimanje/kb`
  i `export/` nikad ne ulaze u ovaj repo.
- **Javni repo:** nikakvi e-mailovi, imena testera, tokeni, linkovi pozivnica, ni u kodu, ni u
  testovima, ni u dokumentima. U testovima `a@primjer.hr` i slično.
- **Orkestracija:** posao rade Opus 5.5 subagenti (`model: "opus"`), glavna sesija orkestrira.
  Paket razbij na (a) implementaciju i (b) testove i spajanje. `effort` uvijek eksplicitno
  (`high` za kod, `medium` za čitanje). Najviše 2–3 agenta paralelno; u ovom lancu u pravilu jedan
  za drugim, jer svi diraju `src/lib/admin/` ili `middleware.ts`. Fable samo uz korisnikov pristanak.
- **Agentima zabrani** `docs/rbac/TODO.md`, `plan.md`, `decisions.md` i handoffe. Orkestrator ih
  ažurira; agent odluke predlaže u svom izvještaju.
- **Čitanje:** `grep` i `sed -n`, ne cijele datoteke; datoteku ne čitati dvaput.
- **Testovi:** `node --test`, bez mreže, `skipped 0`. D1 SQL kroz harness `src/lib/test/d1.ts`
  (nastaje u S1) nad svim migracijama.
- **Trošak:** ne pokretati `scripts/runner.sh` ni ElevenLabs red da bi se nešto „isprobalo”.
  e2e kvote provjerava upis u red, ne generiranje. Nikad `claude -p` petlja.
- **Brojke** samo s naredbom koja ih je dala.
- **Autonomno:** odluči sam i zapiši odluku (blok sesije). Svaki zeleni korak commitaj na `main`
  imenovanim datotekama (nikad `git add -A`), trailer `Co-Authored-By` po pravilima sesije.
  Push na `origin/main` je dio wrap-upa. Produkcija (`db:migrate --remote`, `deploy`, secreti,
  Access) samo u S5 uz „go”.
- **Lokalno:** `npm run db:migrate:local`, `npm run dev` (pozadinski; gasi se `npx astro dev stop`),
  lokalna sesija po `docs/admin.md` („Lokalno”). Passkey na localhostu ima rpID `localhost`.
- **Token budget:** bez Monitora za napredak; dugi poslovi s `run_in_background`, javi se na kraju.
  Oko 150k konteksta orkestratora zatvori sesiju po koraku 3 lanca.
- **Istraživanja** u `docs/rbac/research/YYYY-MM-DD-*.md`.
