# Naplata i računi kroz domovina-fiskal

Od 25. 11. 2026. Uplata za paket s `/cijene` (narudžba kroz `/pristup?paket=`) završava računom koji izdaje
**ITalk d.o.o. kao tenant u domovina-fiskal** (`github.com/domovinatv/domovina-fiskal`). Zasad samo na stagingu, sa
**simuliranom uplatom** na `/admin/zahtjevi`; pravi checkout (kartica) i prepoznavanje SEPA uplate dolaze kasnije.

## Koji račun za koju uplatu

Vrstu računa određuje **način plaćanja**, ne samo kupac (`src/lib/naplata.ts`, `vrstaRacuna`):

| Plaćanje | Fizička osoba | Firma ili obrt | Javna ustanova |
|---|---|---|---|
| Kartica | fiskalizirani račun (`FISKALNI_B2C`, `KARTICA`) | fiskalizirani račun + OIB kupca + napomena po čl. 39 Zakona o fiskalizaciji; eRačun B2B samo ako ga kupac traži | isto kao firma |
| SEPA / virman (instant po ponudi) | fiskalizirani račun (`TRANSAKCIJSKI`) | **eRačun B2B** (obavezan) | **eRačun B2G** (obavezan) |

- Čl. 39: transakcija plaćena gotovinom ili karticom može se izuzeti od eRačuna ako je za nju izdan fiskalizirani
  račun; **tada se uz njega ne smije izdati i eRačun**. Izuzeće je pravo izdavatelja, pa kad kupac traži eRačun,
  izdaje se eRačun umjesto fiskaliziranog računa ([mišljenje PU](https://porezna-uprava.gov.hr/Misljenja/Detaljno/2711)).
- Od 2026. svi računi građanima se fiskaliziraju, neovisno o načinu plaćanja.
- Uzor (kartica → fiskalni račun i firmi): `domovina-fiskal/docs/reference/akd-certilia-webshop-fiskalizacija.md`.
- Firma koja eRačun zatraži **nakon** kartičnog plaćanja: storno fiskaliziranog računa (`POST /racun/:id/storno`) pa
  novi eRačun s napomenom „zamjenjuje račun br. X”. Još nije u adminu.

⚠️ Potvrditi s knjigovođom: tablicu iznad, KPD `58.29.36` („Ostale aplikacije na internetu”) i OIB operatera
(`OibOper`) za automatsko izdavanje.

## Stavka

Cijene s `/cijene` su s PDV-om; na račun ide neto (÷ 1,25) i 25 % PDV-a (kategorija `S`), jedinica `C62`:
mjesečno 8,00 + PDV = 10 €, godišnje 80,00, doživotno 200,00, ustanova N × neto cijene licence s popustom (50+ licenci
je po dogovoru i ovdje se ne naplaćuje).

## Tijek (`src/lib/admin/uplate.ts`)

1. `plati()`: upiše uplatu (`uplate`, migracija 0048; jedna po zahtjevu), odobri zahtjev (pozivnica, kao „Odobri”)
   i izda račun. Uplata ostaje i kad odobravanje ne prođe (npr. osoba već ima račun): novac je stigao.
2. `izdajRacun()`: `POST {FISKAL_URL}/api/v1/racun` s `Idempotency-Key: logomedo-<staging|prod>-uplata-<id>`, pa
   dostava: fiskalizirani račun `POST /racun/:id/posalji` (PDF e-poštom), eRačun `POST /racun/:id/posalji-eracun`
   (doku). Ponovni poziv (gumb „Ponovi”) ne izdaje drugi račun: fiskal po ključu vraća postojeći.
3. Fiskalizirani račun se ne šalje dok nema JIR-a (fiskal vraća `NEMA_JIR`); status ostaje „izdan”, „Ponovi” ga
   pošalje kad CIS odgovori.
4. PDF: `/admin/zahtjevi/racun/<id uplate>` (superadmin; API ključ fiskala ostaje na serveru).

**Staging šalje račun e-poštom samo superadminu** koji je unio uplatu: staging je kopija produkcijske D1 sa stvarnim
adresama. eRačun na stagingu ide kroz doku **test** okolinu.

## Konfiguracija

| | Staging | Produkcija |
|---|---|---|
| `FISKAL_URL` (var) | `https://fiskal-test.domovina.ai` | nije postavljen (naplata isključena) |
| `FISKAL_PROSTOR` / `FISKAL_UREDAJ` (var) | `PP1` / `2` | |
| `FISKAL_API_KLJUC` (secret) | ključ `dfk_8250856a…` („logomedo-staging”), kopija u `domovina-fiskal/secrets/logomedo-staging-api-kljuc.txt` | |
| `FISKAL_OPERATER_OIB` (secret) | OIB operatera iz ITalk tenanta | |
| `NAPLATA_SIMULACIJA` (var) | `da` | nikad |
| D1 `uplate` (0048) | da | da (prazna, od 25. 11.) |

Na fiskal-testu ITalk tenant (id 1) ima prostor `PP1` (prijavljen), uređaj `1` („API blagajna”) i od 25. 11. uređaj
`2` („LogoMedo web”), da se brojevi računa (`N/PP1/2`) ne miješaju s ručno izdanima. Na produkcijskom fiskalu ITalk ima
certifikat i `PP1`, ali **doku nije postavljen**, pa eRačun s produkcije još ne može.

Stranica `/admin/zahtjevi` čita `uplate` samo kad je simulacija ili fiskal postavljen, pa je `main` siguran za deploy na
produkciju i bez migracije 0048.

## Što još nije

- **Kartični checkout** (preporuka Stripe: pretplate + webhook; Stripeove vlastite „Invoice” mailove isključiti):
  webhook o uspješnoj naplati poziva `plati()` s `izvor = 'stripe'`; mjesečna pretplata = nova uplata i račun svaki mjesec.
- **SEPA instant**: predračun s pozivom na broj, uplatu prepoznaje `domovinatv/bank-push-gateway` (push bankovne
  aplikacije → webhook `account.credit`), uparivanje po pozivu na broj i iznosu → `plati()` s `izvor = 'banka'`.
- Javne ustanove obično plaćaju po računu, ne unaprijed: eRačun prvo (s rokom plaćanja), pristup odmah.
- Storno i eRačun naknadno (gore), povrat novca (storno na `charge.refunded`).
- Produkcija: doku za ITalk na produkcijskom fiskalu te ključ i uređaj na produkciji.
