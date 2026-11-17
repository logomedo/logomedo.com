# Razvrstavanje u vreće (plan, 17. 11. 2026.)

Ideja logopedice: pred djetetom je više sličica, a ono ih razvrstava u dvije ili tri kategorije, npr. po
prvom glasu. Božićna inačica: dvije vreće, na svakoj jedno slovo.

Odluke (17. 11. 2026., odgovori u razgovoru):

- **Gdje:** papir i ekran. PDF/HTML ispis: slike gore, vreće dolje, dijete povlači crtu od slike do vreće.
  „Dijete rješava”: slika se povuče prstom (pointer events) u vreću, kriva se vrati na mjesto.
- **Izgled:** tema se bira po zadatku: `vrece` (božićna), `kosare`, `kutije`. Crtež je jednostavan inline
  SVG s oznakom (slovo ili broj) na sredini, bez generiranja slika (Vertex se plaća).
- **Pravila** (sva odmah): `prvi_glas`, `zadnji_glas`, `slogovi` (broj slogova), `glasovi` (broj glasova:
  LJ, NJ, DŽ su jedan glas, LJUTO = 4, kao „Prebrajanje”, `brojGlasova`; potvrđeno 17. 11. 2026.: „broj glasova”,
  ne broj slova).

## Model (prijedlog)

Nova vrsta `razvrstavanje` (u UI-ju „Razvrstavanje”), migracija s `'razvrstavanje'` u CHECK na `zadaci.vrsta`
(kao `0022_prvi_glas.sql`, `0025_slogovi.sql`) i područje (prvi glas → „Prvi glas u riječi”, slogovi →
„Prebrajanje”; ili novo „Razvrstavanje”: pitati ili odabrati po predlošku).

```ts
interface Razvrstavanje {
  pravilo: "prvi_glas" | "zadnji_glas" | "slogovi" | "glasovi";
  tema: "vrece" | "kosare" | "kutije";
  kategorije: string[];                       // 2–3: slova („C”, „LJ”) ili brojevi („2”)
  slike: { rijec_id: Id; kategorija: number }[]; // 6–12, redoslijed na ekranu/papiru
  po_glasovima?: PoGlasovima;                 // kao u Odabir, kad je složen po glasovima
}
```

Ključ riječi: `prvi_glas` / `zadnji_glas` iz `fonemi()` (isto kao odnosi `pocetni_glas` / `zavrsni_glas` u
`odnosi.ts`), `slogovi` iz `brojSlogova`, `glasovi` iz `brojGlasova` (`izbroji` u `vrste.ts`). Izrazi
(ČAROBNI ŠTAPIĆ) ne ulaze, kao kod odnosa.

## Što sve treba (po uzoru na `prvi_glas` 8ea5957 i `slogovi` c64121b)

1. `vrste.ts`: tip, `VRSTE`, `prazno`, `normaliziraj` (granice: 2–3 kategorije, 2–12 slika, kategorije
   različite), `rijeciU`, `BROJ_STAVKI` (broj slika, zadano 8), `brojUZadatku`, `zadanaUputa`
   („Razvrstaj slike u vreće prema prvom glasu.” itd. po pravilu i temi), `provjeri` (svaka slika pripada
   upisanoj kategoriji po pravilu, kategorija bez ijedne slike, ista kategorija dvaput, riječ bez slike),
   `ocijeni` (prvi pokušaj), `slozi` (2–3 ključa s dovoljno riječi sa slikom, po 3–4 slike, izmiješano;
   `ciljevi`/po glasovima: odabrani glasovi su kategorije) + testovi.
2. Editor (`klijent.ts`, `zadaci/[id]/index.astro`): prekidač pravila (s potvrdom i ponovnim slaganjem, kao
   promjena odnosa), prekidač teme, kategorije (slovo s kola ABECEDA / broj −+), slike sa `slot()` i
   oznakom kategorije (automatski iz pravila, ručno se može prepisati kao „slogova” u Prebrajanju),
   „Složi automatski”.
3. HTML ispis + PDF (`pdf/model.ts`, `pdf/ispis-pdf.ts`, `b/[slug]/ispis.astro`): mreža slika, red vreća s
   oznakom (Andika), uputa; pregled = PDF (`sirine.ts`).
4. „Dijete rješava” i igra bilježnice (`IgraDjeteta.astro`, `biljeznice-igra.ts`, `biljeznice-ekrani.ts`):
   povlačenje u vreću, zvuk riječi na dodir, kriva se vrati, „Bravo” kad su sve razvrstane.
5. Predlošci (`predlosci.astro`, `api/zadatak/index.ts`): kartica s gumbima pravila, „Po glasovima…” za
   prvi/zadnji glas.
6. `zvukovi.ts`: izgovor uputa i slova/brojeva ako treba.
7. `docs/zadaci.md`: odjeljak `### razvrstavanje`. Flutter app: ne (crta samo scenu).

## Stanje (17. 11. 2026. kasno)

Gotovo i deployano, kartica „Razvrstavanje” vidljiva u Predlošcima:

- model, provjere, ocjena, generator (`vrste.ts`, testovi), ekran igre (`biljeznice-ekrani.ts`)
- migracija `0034_razvrstavanje.sql` (CHECK + područje „Razvrstavanje” pod predvještinama): primijenjena i na
  produkciji 17. 11. 2026. (155 zadataka, verzija i 15 veza bilježnica na broju)
- editor, HTML ispis, PDF, javni ispis bilježnice
- igra: povlačenje prstom u spremnik / dodir slike pa spremnika (`biljeznice-igra.ts`, CSS u `IgraDjeteta.astro`)
- spremnici kao slike iz Vertexa (`scripts/spremnici-slike.sh` + `spremnici-obrada.py`, `public/spremnici/`,
  krug za oznaku izmjeren u `SPREMNICI` u `spremnici.ts`); vektorski oblik je rezerva u PDF-u

Preostalo:

1. Igru isprobati u pregledniku (lokalno `/admin/zadaci/<id>/dijete`: povlačenje, kriva se vraća, Bravo).
3. Predložak „Po glasovima…” za prvi/zadnji glas (`api/zadatak/index.ts`: `slova` iz oznaka kao kod `prvi_glas`,
   `naslovDijaloga`, `jePoGlasovima` u `listic-glas.ts`).
4. `docs/zadaci.md`: odjeljak `### razvrstavanje`.
