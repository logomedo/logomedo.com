# Okviri radnih listića

Status (2026-11-15): na produkciji. Okvir se bira po zadatku u editoru (`/admin/zadaci/<id>`, bočna ploča „Okvir za ispis”)
i vrijedi samo za papir: PDF i pogled Ispis. Igra na ekranu ga nema.

## Dijelovi

Okvir je JSON u `zadaci.okvir` (migracija 0030; NULL = bez okvira), kod je `src/lib/okviri.ts`:

- **rub**: bez, kockice crveno-bijele, kockice zeleno-bijele, pruge zeleno-bijele, prugice crveno-bijele.
  Kombinirane crveno-zelene kockice su namjerno izostavljene (Anita: ne sviđaju joj se).
- **mašna** gore u sredini: crvena ili zelena, samo vrpca (bez iglica, ponovno generirane 15. 11.). „Velika mašna”
  (`velikaMasna`) je 56 × 38 mm umjesto 38 × 26 i spušta zaglavlje za ~12 mm; pravilo kvalitete je odbije gdje bi to smanjilo slike.
- **kutovi** (gore lijevo, gore desno, dolje lijevo, dolje desno): medvjedić, konjić za ljuljanje, medenjak, grančica jele,
  okićeno drvce, zlatni praporci, snjegović, auto s borom i poklonima, božićni vrtuljak, imela.
- **Gotovi okviri** (`GOTOVI`): Jednostavni, Kockice, Pruge (iz Anitine skice). „Vlastiti” je bilo koja druga kombinacija.

## Crtanje

`slojevi(okvir)` daje pravokutnike uzorka, bijelu karticu (14 mm od ruba, zaobljena, smeđi obrub) i slike ukrasa.
Isti slojevi idu u PDF (`ispis-pdf.ts`, `drawRectangle` s prozirnošću) i u HTML pregled (`okvirSvg`), pa izgledaju jednako.

- Uzorak počinje 5 mm od ruba papira: kućni pisači ne ispisuju do ruba. Boje su svijetle (kockice 32 % prozirnosti), da rub
  ne troši puno tinte. Kockice su okomite i vodoravne pruge preko kojih se sjecišta zatamne. Pruge i prugice su iste širine (2,5 mm, korak 5 mm):
  šire zelene pruge (6 mm) izgledale su kao ploha, ne kao izmjena.
- Ukrasi su PNG s prozirnošću u `public/okviri/` (480 px, kvadrat). `preglednik.ts` ih pri slaganju PDF-a ne pretvara u JPEG
  (`jeUkrasUrl`), jer leže na uzorku. Mašna 38 × 26 mm, ukras u kutu 28 mm.
- `podrucje(okvir)` je prostor za zadatak: 20 mm sa strana (bez okvira 15), vrh ispod mašne, dno iznad donjih ukrasa.
  Mašna ili ukras u gornjem kutu centriraju naslov, uputu i ime (širina 140 mm, između kutova).

## Kvaliteta ispisa

Okvir smanjuje prostor, pa `okvirDopusten` (`pdf/model.ts`) procjenjuje najmanju sliku svake stranice sa okvirom i bez
njega (`najmanjaSlika` ponavlja formule iz `ispis-pdf.ts`; promjena rasporeda tamo mora i tamo). Okvir je dopušten ako sve
stane i najmanja slika ostane barem 30 mm (`NAJMANJA_SLIKA`), a kad je i bez okvira manja, okvir je ne smije smanjiti.

- U editoru su nedopušteni gotovi okviri i dijelovi označeni „(ne može)”, a izbor koji ne prolazi pokaže obavijest s
  razlogom (koliko bi slike bile velike).
- Ako se sadržaj kasnije promijeni (više slika) pa spremljeni okvir više ne prolazi, ploča to kaže, a PDF i Ispis ga izostave.
- Primjeri: listić 4–12 slika „prema broju slika” prolazi; 5 × 6 (slike ~3 cm) ne prolazi. Uparivanje treba 168 mm širine,
  s okvirom ih ima 170.

## Slike ukrasa

Jednokratno, plaća se (~$0,04 po slici, 12 slika):

```bash
./scripts/okviri-slike.sh <sirovi-dir> [ime ...]     # Vertex, stil ilustracija; 429 → ponoviti pojedinačno sa stankom
python3 scripts/okviri-obrada.py <sirovi-dir> [ime ...]   # prozirna pozadina, kvadrat → public/okviri/*.png
```

Vertex je 15. 11. 2026. na 4 od 12 istodobnih zahtjeva vratio 429; pojedinačno sa stankom od 45 s prolazi.
Konjiću ostaje bijela površina između nogu (poplava od ruba do nje ne dođe); na bijeloj kartici se ne vidi.

## Vezani dokumenti

- `docs/zadaci.md`: vrste zadataka i ispis.
