# Lighthouse, staging (S6, 19. 11. 2026.)

Naredba (po stranici, mobitel = zadano, desktop = `--preset=desktop`), sustavni Chrome:

```
CHROME_PATH=".../Google Chrome" npx -y lighthouse@12.8.2 https://staging.logomedo.com<putanja> [--preset=desktop] \
  --quiet --chrome-flags="--headless=new" --only-categories=performance,accessibility,best-practices,seo --output=json
```

Prvo mjerenje: staging `a8c5a4db` (commit `150c7ca`). Redoslijed brojki: performance / accessibility / best practices / SEO.

| Stranica | Mobitel | Desktop |
| --- | --- | --- |
| `/` | 81 / 100 / 100 / 69 | 100 / 100 / 100 / 69 |
| `/katalog` | 86 / 100 / 96 / 69 | 99 / 100 / 100 / 69 |
| `/radni-listici` | 100 / 100 / 100 / 69 | 100 / 100 / 100 / 69 |
| `/igre` | 99 / **95** / 100 / 69 | 100 / **95** / 100 / 69 |
| `/o-nama` | 99 / **95** / 100 / 69 | 100 / **95** / 100 / 69 |
| `/privatnost` | 100 / 100 / 100 / 66 | 100 / 100 / 100 / 66 |
| `/uvjeti` | 93 / 100 / 100 / 66 | 100 / 100 / 100 / 66 |

## Nalazi i što je učinjeno

- **Accessibility 95 na `/igre` i `/o-nama`: `color-contrast`** na gumbu „Zatraži pristup” unutar sekcije (G-6R, O-3):
  `Sekcija.astro` je s `.tekst :global(a)` gumbu davao boju linka (`--med-tamno` na `--med`, 1,21:1). Popravak:
  `a:not(.gumb)`. Ponovno mjerenje (staging `05029b71`, mobitel): `/igre` 97 / 100 / 100 / 69, `/o-nama`
  98 / 100 / 100 / 69, `/katalog` 95 / 100 / 96 / 69.
- **SEO 66–69 svugdje: jedini pali audit je `is-crawlable`**, jer staging namjerno šalje `x-robots-tag: noindex`
  (odluka 207). Razlika 66 / 69 je samo u težini audita koji se na stranici ne primjenjuju. Na produkciji tog zaglavlja
  nema; ponoviti Lighthouse na `logomedo.com` nakon „go” (očekuje se 100).
- **Best practices 96 na `/katalog` (mobitel): `image-aspect-ratio`** za `v6-mobitel.webp`: `<img>` ima
  `width/height` desktop snimke (1280×800), a uspravnu sliku daje `<source media width height>`. Preglednik crta
  okvir iz `<source>` dimenzija; Lighthouse uspoređuje samo atribute `<img>`. Ostavljeno (≥ 90, odluka 610).
- Performance na mobitelu 81–86 na `/` i `/katalog` u prvom mjerenju (hero snimke); u drugom mjerenju `/katalog`
  95. Ispod praga 90 nema ničega u accessibility ni SEO osim `is-crawlable`.

## Produkcija nakon objave (19. 11. 2026., verzija `d6005500`)

Ista naredba nad `https://logomedo.com<putanja>`. Performance / accessibility / best practices / SEO.

| Stranica | Mobitel | Desktop |
| --- | --- | --- |
| `/` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/katalog` | 90 / 100 / 96 / 100 | 100 / 100 / 100 / 100 |
| `/radni-listici` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/igre` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/o-nama` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/privatnost` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/uvjeti` | 94 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/pristup` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |

SEO 100 svuda: produkcija nema `noindex` (staging ga ima, zato je ondje SEO bio niži).
