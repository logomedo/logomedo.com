# Dnevnik aktivnosti

`/admin/aktivnost`: sve izmjene kataloga, svih admina i runnera, najnovije gore, osvježava se
svakih 5 s. Na stranici riječi je isti dnevnik suženo na tu riječ i njene slike.

## Zašto ne D1 Time Travel

Time Travel vraća **cijelu bazu** na trenutak (na mjestu, sve tablice, svi korisnici), ne zna
tko je što mijenjao i ne može pročitati stari redak bez vraćanja. Ostaje mreža za katastrofe
(30 dana), a za „vrati ono što je netko maloprije promijenio” služi ovaj dnevnik.

## Kako se piše

Tablica `aktivnost` (`migrations/0009_aktivnost.sql`): tko, radnja, tablica, redak, grupa i
JSON snimak retka **prije** i **poslije**. Pomoćne funkcije u `src/lib/aktivnost.ts` vraćaju
naredbe koje idu u isti `db.batch()` kao i izmjena, pa je sve jedna transakcija:

- `sZapisom(zapis, kljuc, izmjene)`: jedan redak. `kljuc` je id ili podupit (novi redak:
  `SELECT id FROM rijeci WHERE rijec = ?`), pa `prije` ispadne NULL.
- `zapisSkupa(zapis, gdje, izmjene)`: skup postojećih redaka u tri naredbe (istisnuta
  odobrena slika, pražnjenje reda). Unutar grupe `radnja` mora biti jedinstvena.
- `zapisNastalih(zapis, gdje)`: skup upravo nastalih redaka (poslovi u redu).

Zapis u kojem je `prije IS poslije` se briše, pa uvjetni UPDATE koji ništa ne promijeni
(dvoje istovremeno odobrava) ne ostavlja trag. Snimci (`SNIMAK`) namjerno ne sadrže vremena
ni brojače runnera, da isto stanje uvijek da isti JSON.

Bilježi se: odluke o slikama (web i `/api/v1`), nove slike (runner i upload), zahtjevi za
generiranje i pražnjenje reda, nova riječ, uređivanje riječi, potvrda i micanje pozicije glasa,
spremanje bilježnice. Ne bilježi se: runnerovo uzimanje i greške poslova, „vrati greške u red”,
zadaci (imaju svoje verzije u `zadatak_verzije`), sesije i ključevi.

## Poništi i Vrati na ovo

Oba rade nad cijelom **grupom** (jedna radnja korisnika, npr. odobrena slika + istisnuta
dosadašnja, ili nova riječ + poslovi u redu):

- **Poništi**: primijeni snimke `prije`, od zadnjeg zapisa grupe prema prvom.
- **Vrati na ovo**: primijeni snimke `poslije`, redom.

Ništa se ne briše: vraćanje je nova izmjena s novom grupom i `vraca_id` na izvorni zapis, pa
se i ono može poništiti. Ako je redak poslije opet mijenjan, stavka ima oznaku „kasnije
mijenjano” i vraćanje svejedno prepisuje trenutno stanje (namjerno, to je restore).

Posebni slučajevi: slika koja postaje odobrena prvo istisne dosadašnju (zapisano); poništena
nova riječ se samo deaktivira (`aktivna = 0`); poništen zahtjev za generiranje briše posao samo
ako još čeka; vraćeni posao ulazi u red kao novi, ako ta riječ i stil već nemaju posao. Nakon
vraćanja slika usklađuje se javni bucket (`uskladiJavno`), a nakon vraćenih poslova budi se runner.

## Zamke i ograničenja (1. 11. 2026.)

- **Broj naredbi u batchu.** `sZapisom` dodaje tri naredbe po retku. Za red generiranja
  (do 428 riječi) to bi bilo preko tisuću upita u jednom pozivu Workera, pa red ide skupno
  (`zapisNastalih`, `zapisSkupa`) i vraćanje poslova je skupno. D1 dopušta najviše 100
  parametara po upitu, pa se popisi id-ova šalju kao JSON kroz `json_each(?)`.
- **„Zadnji zapis” = `MAX(id)`.** To vrijedi jer je batch jedna transakcija. Izvan batcha ne vrijedi.
- **Vraćeni posao ne zna svoj id unaprijed.** Nalazi se po `id > MAX prije` + `zatrazio` + `ceka`.
  Teoretski može uhvatiti posao koji je isti admin istovremeno dodao u drugoj kartici.
- **Generirani stupac** `rijec_id` (VIRTUAL, s indeksom) i `json_group_array(... ORDER BY ...)`
  rade lokalno (miniflare D1); na produkciji je migracija 0009 prošla, a sami upisi još nisu viđeni.
- **Nije u dnevniku:** zadaci, „Vrati greške u red”, runnerovo uzimanje i greške poslova,
  izmjene ravno u bazi (`wrangler d1 execute`, seed). Takve izmjene ne mijenjaju zapise, ali
  „Vrati” na starom zapisu prepisat će ih bez upozorenja, osim oznake „kasnije mijenjano”
  ako je u međuvremenu bio i zabilježeni zapis.
- **Rast tablice.** Nema čišćenja; red generiranja upisuje po jedan redak po poslu. Kad bude
  smetalo: brisati zapise starije od N dana, ili grupe `generiranje.*` sažimati.

Vezani dokumenti: `docs/katalog.md` (shema kataloga, red generiranja), `docs/app-api.md`
(odluke iz aplikacije idu kroz isti `odluci()` i bilježe se).
