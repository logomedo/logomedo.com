# Uređaji: jedan račun, jedna osoba (24. 11. 2026.)

Cilj: jedan kupljeni račun ne smije raditi za cijeli vrtić (pet logopeda iza jedne licence), a vlasnik
računa ne smije biti kažnjen što radi na laptopu, mobitelu i tabletu.

## Zašto ne passkey, IP ili „fingerprint”

| Signal | Zašto nije dovoljan |
|---|---|
| Passkey | Sinkronizira se (Google Password Manager, iCloud Keychain). Zajednički Google račun u Chromeu na pet računala = isti passkey na pet mjesta. Oznake `backupEligible/backedUp` kažu samo da je sinkroniziran, ne tko ga koristi. Zabrana sinkroniziranih ključeva udarila bi poštene korisnike. |
| IP adresa | Logoped radi iz vrtića, s kućnog Wi-Fija i preko mobilne mreže; pet logopeda istog vrtića dijeli jednu IP. Ni „ista IP = ista osoba” ni obrnuto ne vrijedi. |
| Fingerprint preglednika | Krhak (ažuriranja), lako se zaobilazi, a po GDPR-u/ePrivacy traži privolu. Netflix ga ne treba. |
| Kolačić uređaja | Nasumična oznaka preglednika, nužna za sigurnost računa (bez privole). Obriše li ga netko, dobiva novi uređaj koji opet mora po slobodno mjesto, pa brisanje ništa ne dobiva. |

Jedina stvar koju dijeljenje ne može sakriti je **istovremenost**: jedna osoba ne radi aktivno na tri
uređaja odjednom, a pet logopeda u istom vrtiću rade. Na tome rade i Netflix (broj streamova) i Spotify
(jedan player, „Nastavi ovdje”).

## Kako radi

- **Uređaj** = preglednik s kolačićem `__Host-logomedo_uredaj` (32 nasumična bajta, 400 dana, u D1 samo
  sha-256). Svi tabovi i prozori istog preglednika su jedan uređaj.
- **Aktivan** = s njega je bio zahtjev u zadnjih 15 min (`AKTIVAN_MIN`) i nije odjavljen. Pozadinska
  osvježavanja (pregled svake 3 s) drže otvoren tab aktivnim; to je namjerno, jer je otvoren.
- **Limit**: logoped smije 2 aktivna uređaja odjednom (`ZADANI_LIMIT_UREDAJA`), superadmin mu ga mijenja
  na `/admin/korisnici` (stupac „Uređaji”, polje „odjednom”, prazno = zadano). Superadmin je bez limita.
- **Treći uređaj** ne dobiva zabranu nego stranicu „LogoMedo je otvoren na drugom uređaju” (status 409) s
  popisom aktivnih i gumbom „Odjavi taj i nastavi ovdje”. Odjavljeni uređaj zadržava sesiju; na sljedećem
  zahtjevu vidi „Nastavljeno na drugom uređaju” (koji, gdje, kad). Čim se mjesto oslobodi (drugi uređaji
  15 min neaktivni) vraća se sam, bez stranice i bez nove prijave.
- Fetch s odjavljenog uređaja dobiva JSON 409 `previse_uredaja` sa zaglavljem `x-uredaj: previse`;
  `AdminOkvir` na to osvježi stranicu, pa se pokaže izbor umjesto tihe greške.
- **Postavke → Uređaji**: korisnik vidi svoje uređaje (90 dana), koji je „ovaj”, koji je sada u upotrebi,
  i može odjaviti tuđi/zaboravljeni.

Za jednu osobu: laptop + mobitel rade zajedno; za treći jednom klikne „nastavi ovdje”, što ga ništa ne
košta jer ne sjedi za sva tri. Za ekipu na jednom računu: svaki novi ulazak nekome usred rada ruši
LogoMedo, i to stalno. Tome je cilj trenje, ne tvrda zabrana.

## Signali za superadmina

`/admin/korisnici`, stupac „Uređaji”: aktivnih sada, uređaja / mreža / gradova u 30 dana, preuzimanja i
odbijanja u 7 dana. Crveno kad je ≥ 5 preuzimanja u tjednu ili ≥ 6 uređaja u 30 dana: tada se javiti
korisniku (možda treba više licenci). Mreža je sha-256 prefiksa /24 (IPv4) ili /48 (IPv6) s paprom
`PRISTUP_TAJNA`, skraćen na 16 znakova; puna IP adresa se ne sprema. Grad i AS organizacija su iz
`request.cf`.

Dnevnik `uredaji_dogadaji`: `novi`, `mreza` (uređaj se javio s druge mreže), `preuzimanje`, `odjava`
(iz Postavki), `previse` (uređaj je dobio stranicu izbora; najviše jednom u 15 min).

## Provedba (`UREDAJI_PROVEDBA`)

| Vrijednost | Što |
|---|---|
| prazno (produkcija) | samo bilježi: uređaji i sažetak na `/admin/korisnici`, nikoga ne zaustavlja |
| `logoped` | limit za logopede |
| `svi` (staging) | limit i za superadmina, za testiranje vlastitim uređajima |

Prijedlog uvođenja: tjedan-dva bilježenja na produkciji da se vidi koliko uređaja stvarni logopedi
koriste odjednom, pa `"UREDAJI_PROVEDBA": "logoped"` u `vars` u `wrangler.jsonc`.

## Testiranje na stagingu

`staging.logomedo.com` ima `svi` (limit 2 i za superadmina). Otvori admin u Braveu, Chromeu i Safariju
(ili u Braveu u dva profila + privatni prozor: svaki ima svoj kolačić): treći dobije „Nastavi ovdje”.
Tabovi u istom pregledniku ne smiju nikad dobiti tu stranicu. Testovi: `src/lib/admin/uredaji.test.ts`.

## Što ovo ne pokriva

- Dvije osobe koje rade u različito vrijeme (jutarnja i popodnevna smjena) i dijele račun: istovremenost
  ih ne hvata. Trag su mnogo uređaja / mreža u 30 dana; odluka je ljudska (javiti se ustanovi).
- Mobilna aplikacija (`/api/v1`) je zasad samo za superadmina; kad dobije logopede, `app_sesije.uredaj`
  treba ući u isti brojač.
- Uvjeti korištenja već kažu da je račun osoban i da se prijava ne dijeli (`src/landing/uvjeti/Odredbe.astro`).
