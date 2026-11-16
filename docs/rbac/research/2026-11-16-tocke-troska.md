# Točke troška AI kvote (S4)

Odluka 10: jedan posao upisan u red = jedan kredit; klizni prozor 7 dana; superadmin bez limita, ali se
bilježi. Mehanizam je `src/lib/kvota.ts`: `batchSKvotom(email, vrsta, kolicina, izvor, naredbe)` stavi
uvjetni `INSERT INTO ai_potrosnja` u isti `db.batch` kao posao. Bez mjesta je `kolicina` NULL, batch pada
na `NOT NULL constraint failed: ai_potrosnja.kolicina` i ne upiše se ništa; to postaje `KvotaPrekoracena`.
`kolicina` je broj ili SQL koji broji isti uvjet kao uvjetni upis, pa se ne naplaćuje ono što se ne upiše.
`provjeri()` je provjera unaprijed (nije atomska) gdje zahtjev prije posla trajno mijenja nešto drugo.

Stanje 16. 11. 2026. (retci su iz `grep` ispod).

| Funkcija | Datoteka:redak | Vrsta | Stanje |
|---|---|---|---|
| `dodajURed` | `src/lib/generiranje.ts:56` | slike | kvota; cijeli zahtjev je jedan batch (prije: batch po 50), n = broj upisa (bezuvjetni upisi nakon odabira) |
| pozivatelji `dodajURed`: `/admin/api/generiraj`, `biljeznice.generirajSlike`, `ponoviZa` (iz `odluciIPonovi`, `premjesti`, i preko njih `/admin/api/slika/*`, `/api/v1/admin/slike/*`), `/admin/api/nova-rijec` | | slike | kvota kroz `dodajURed`; `odluciIPonovi`/`premjesti` s `ponovi` i `nova-rijec` imaju i `provjeri()` unaprijed, da bez kredita ne prođe ni odluka ni nova riječ |
| `neuspjeleURed` (/admin/red „Pokušaj ponovo”) | `src/lib/generiranje.ts:71` | slike | kvota onome tko klikne, n = `COUNT(*) … status = 'greska'` (prije: izravan SQL u `red.astro`) |
| `aktivnost.vrati` (ponovni posao) | `src/lib/aktivnost.ts:234` | slike | kvota; n = isti `SELECT` s `NOT EXISTS` kao upis, izračunat na mjestu `NAPLATA` (poslije brisanja iz reda u istom batchu) |
| `zatrazi` (situacija) | `src/lib/pozadine-generiranje.ts:78` | slike | kvota; n = `COUNT(*) WHERE NOT EXISTS (… u redu)`, pa „već u redu” ne naplaćuje |
| `dupliciraj` s uputom | `src/lib/pozadine-generiranje.ts:114` | slike | kvota (n = 1) + `provjeri()` prije stvaranja kopije |
| `ponovi` (situacija) | `src/lib/pozadine-generiranje.ts:125` | slike | kvota; n = isti uvjet „zadnji posao je greška” |
| `dodajZvukove` (`novPosao`) | `src/lib/zvukovi.ts:85` | zvukovi | kvota; jedan batch [potrošnja, INSERT … RETURNING id …], u Queue tek nakon uspjeha |
| `ponoviZvuk` (`novPosao`) | `src/lib/zvukovi.ts:85` | zvukovi | kvota, n = 1 |
| `odbijZvukove({ ponovo })` (`novPosao` s uvjetom) | `src/lib/zvukovi.ts:85` | zvukovi | kvota; odbijanje i novi posao u istom batchu (bez kredita ne odbija ni snimku), n = broj tekstova koji poslije odbijanja nemaju odobrenu, kandidata ni posao |
| `odbijZvukove({ ponovo: false })` | `src/lib/zvukovi.ts:300` | — | bez kvote: samo odbija, nema posla |
| `greskeURed(email)` (/admin/zvukovi „Pokušaj ponovo”) | `src/lib/zvukovi.ts:118` | zvukovi | kvota onome tko klikne, n = broj vraćenih (novi ElevenLabs pozivi, `pokusaji = 0`) |
| `posaljiZaglavljene` | `src/lib/zvukovi.ts:104` | — | bez kvote: ponovno šalje u Queue već plaćene poslove (`radi` zastario → `ceka`) |
| `obradi` (privremena greška → `ceka`) | `src/lib/zvukovi.ts:195` | — | bez kvote: isti plaćeni posao, Queue ga ponavlja (429/5xx) |
| `uzmi` (zastario `radi` → `ceka`) | `src/lib/generiranje.ts:91` | — | bez kvote: isti plaćeni posao, runner ga je izgubio |
| `odgodi` | `src/lib/generiranje.ts:209` | — | bez kvote: runner vraća posao koji nije stigao obraditi (`pokusaji - 1`) |
| `neuspjeh` | `src/lib/generiranje.ts:216` | — | bez kvote: pokušaji istog posla do `MAX_POKUSAJA = 3` |
| `preimenuj` (posao na drugu riječ) | `src/lib/generiranje.ts:532` | — | bez kvote: premješta postojeće poslove, ne stvara nove |
| `uzmiPozadinu` / `odgodiPozadinu` / `neuspjehPozadine` | `src/lib/pozadine-generiranje.ts:140`, `:177`, `:183` | — | bez kvote: isti razlozi kao `uzmi` / `odgodi` / `neuspjeh` |
| probe glasova (`/admin/api/zvuk-proba`) | — | — | bez kvote (odluka 10: administracija); ne upisuje u `zvuk_generiranja` |

## Dokaz: nema upisa posla ni vraćanja u `ceka` izvan popisa

```
$ grep -rnE "INSERT (OR [A-Z]+ )?INTO (generiranja|pozadina_generiranja|zvuk_generiranja)\b|UPDATE (generiranja|pozadina_generiranja|zvuk_generiranja) SET .*'ceka'|UPDATE (generiranja|pozadina_generiranja|zvuk_generiranja) SET status = \?" src scripts --include=*.ts --include=*.astro --include=*.js --include=*.mjs --include=*.sh | grep -v '\.test\.ts'
src/lib/aktivnost.ts:234:        `INSERT INTO generiranja (rijec_id, stil_id, prompt, zatrazio, predlozak_verzija)
src/lib/pozadine-generiranje.ts:78:      `INSERT INTO pozadina_generiranja (pozadina_id, iz, u, izvor_kljuc, aspekt, prompt, zatrazio)
src/lib/pozadine-generiranje.ts:114:    "INSERT INTO pozadina_generiranja (pozadina_id, iz, u, izvor_kljuc, aspekt, prompt, zatrazio) VALUES (?, ?, ?, ?, ?, ?, ?)",
src/lib/pozadine-generiranje.ts:125:      `INSERT INTO pozadina_generiranja (pozadina_id, iz, u, izvor_kljuc, aspekt, prompt, zatrazio)
src/lib/pozadine-generiranje.ts:140:    `UPDATE pozadina_generiranja SET status = 'ceka' WHERE status = 'radi' AND uzeto_at < datetime('now', '-${ZASTARIO_MIN} minutes')`,
src/lib/pozadine-generiranje.ts:177:    "UPDATE pozadina_generiranja SET status = 'ceka', pokusaji = MAX(pokusaji - 1, 0), uzeto_at = NULL, greska = ? WHERE id = ? AND status = 'radi'",
src/lib/pozadine-generiranje.ts:183:    `UPDATE pozadina_generiranja SET greska = ?, status = CASE WHEN pokusaji >= ${MAX_POKUSAJA} THEN 'greska' ELSE 'ceka' END
src/lib/zvukovi.ts:85:    `INSERT INTO zvuk_generiranja (kljuc, izgovor, zatrazio, varijante) SELECT ?, ?, ?, ?${uvjet ? ` WHERE ${uvjet.sql}` : ""} RETURNING id`,
src/lib/zvukovi.ts:104:    `UPDATE zvuk_generiranja SET status = 'ceka' WHERE status = 'radi' AND uzeto_at < datetime('now', '-${ZASTARIO_MIN} minutes')`,
src/lib/zvukovi.ts:118:      env.DB.prepare("UPDATE zvuk_generiranja SET status = 'ceka', pokusaji = 0, greska = NULL WHERE status = 'greska' RETURNING id"),
src/lib/zvukovi.ts:139:    `UPDATE zvuk_generiranja SET status = 'radi', uzeto_at = datetime('now') WHERE id = ? AND status = 'ceka'
src/lib/zvukovi.ts:195:    await db.prepare("UPDATE zvuk_generiranja SET status = ?, greska = ?, uzeto_at = NULL WHERE id = ?")
src/lib/generiranje.ts:56:      db.prepare(`INSERT INTO generiranja (rijec_id, stil_id, prompt, zatrazio, predlozak_verzija, prioritet)
src/lib/generiranje.ts:71:    env.DB.prepare("UPDATE generiranja SET status = 'ceka', pokusaji = 0, greska = NULL WHERE status = 'greska'"),
src/lib/generiranje.ts:91:    `UPDATE generiranja SET status = 'ceka' WHERE status = 'radi' AND uzeto_at < datetime('now', '-${ZASTARIO_MIN} minutes')`,
src/lib/generiranje.ts:209:    "UPDATE generiranja SET status = 'ceka', pokusaji = MAX(pokusaji - 1, 0), uzeto_at = NULL, greska = ? WHERE id = ? AND status = 'radi'",
src/lib/generiranje.ts:216:    `UPDATE generiranja SET greska = ?, status = CASE WHEN pokusaji >= ${MAX_POKUSAJA} THEN 'greska' ELSE 'ceka' END
src/lib/generiranje.ts:532:        `UPDATE generiranja SET rijec_id = ?1 WHERE rijec_id = ?2 AND status = 'ceka'
```

Svaki redak je u tablici (`zvukovi.ts:139` je `ceka` → `radi`, uzimanje posla, nije vraćanje u red).
`src/pages/admin/red.astro` više nema izravan `UPDATE generiranja … 'greska'` (sad `neuspjeleURed`).

## Prikaz prekoračenja

`src/middleware.ts` (`sKvotom`) hvata `KvotaPrekoracena` iz `next()` (Astro 7.4: greška iz frontmattera
stranice ili rute propada kroz `next()`, `core/pages/handler.js`). `odgovorNaKvotu`: JSON 429
`{ error: "kvota", poruka, greska, ok: false }` za `/api/*`, `x-ajax` i `/admin/api/*` bez form tijela;
obrazac (form POST, i na `/admin/api/generiraj`) 303 natrag na Referer istog origina (inače `/admin`) s
`?kvota=`, koji `AdminOkvir` prikazuje iznad sadržaja. `/admin/zvukovi` (fetch s `x-ajax`) i
`/admin/api/nova-rijec` (forma ostaje popunjena) hvataju grešku sami.
