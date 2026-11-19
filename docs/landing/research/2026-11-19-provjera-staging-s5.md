# Provjera staginga nakon S5 (19. 11. 2026.)

Verzija `b46a6a21` (`npm run deploy:staging` s grane `landing`, commit iza `9576b65`).

## `scripts/landing-provjera.sh staging.logomedo.com`

`Zbroj: 130 OK, 0 GREŠKA` (S4: 118). Razlika: novi interni linkovi na snimke i sovu sa `/igre` i `/o-nama`, i nova
provjera „bez placeholdera — S6]” za svih šest stranica.

## Vizualni pregled

Playwright (`playwright-core`, sustavni Chrome) nad `dist/client` (lokalni `python3 -m http.server`) i nad stagingom,
`/igre`, `/o-nama`, `/privatnost` u tri varijante: 1280×800 svijetla, 360×780 svijetla, 1280×800 tamna, cijela stranica
uz pomicanje (lazy slike). Nijedna stranica nije šira od viewporta (`scrollWidth`).

Nađeno i popravljeno: kartice tema na `/igre` bile su bez okvira i s naslovom slijepljenim uz tekst, jer je pravilo
`.tekst .teme` u `Teme.astro` dobilo scope komponente (`.tekst` je u `Sekcija.astro`).

Placeholderi prazni (zadano stanje): na `/igre`, `/o-nama` i `/privatnost` nema „javite se”, „Zatraži pristup”,
„Isprobaj igru”, „Voditelj obrade” ni rečenice o bojankama (`grep` nad `dist/client/*.html`).
