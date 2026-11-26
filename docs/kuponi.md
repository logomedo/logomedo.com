# Kuponi na /pristup

Od 25. 11. 2026. Kupon je kod koji osoba upiše u obrazac `/pristup` (polje „Kupon”) ili dobije u linku
`/pristup?kupon=KOD` (kod je tada već upisan, a naslov kaže „Pristup s kuponom”).

**Auto-odobravanje:** kupon s kvačicom „Auto-odobri” sam odobrava zahtjev: odmah se izdaje pozivnica i šalje
e-poštom (kao „Odobri” na `/admin/uprava/zahtjevi`), a osoba vidi „Pristup je odobren” (`/pristup?poslano=kupon`).
Superadmin ne mora ništa kliknuti; u „Zadnjim obrađenima” stoji `Obradio: kupon:KOD`.

## Nakon odobravanja (od 26. 11. 2026.)

Ekran `/pristup?poslano=kupon` u istom pregledniku zna zahtjev po kolačiću `__Host-logomedo_pristup` (72 h, HttpOnly;
u bazi samo sha-256 u `zahtjevi_pristupa.pracenje_hash`, migracija 0050). Prikazuje:

- na koji je e-mail pozivnica otišla (da osoba vidi tipfeler) i link na obrazac s istim kuponom za ispravak;
- upute: pošiljatelj, naslov, Spam i Promocije;
- **Pošalji ponovno**: najranije 60 s nakon zadnjeg slanja (odbrojavanje u `public/landing/pristup.js`, a poslužitelj
  isto provjerava atomski), najviše 4 slanja. Svako slanje je **nova** pozivnica (`stvorio = sam (ponovno slanje)`),
  prijašnji link prestaje vrijediti;
- nakon prvog ponovnog slanja **Mail nije stigao** (+ dobrovoljan broj mobitela ili druga adresa): `pomoc_at`,
  `pomoc_kontakt`, superadmin dobije obavijest „Pozivnica nije stigla” (jednu po zahtjevu, bez adrese u mailu).

Na `/admin/uprava/korisnici` (otvorene i istekle pozivnice) stupac „Kupon / slanja” pokazuje kupon, broj slanja,
„mail nije stigao” i kontakt; takve pozivnice su na vrhu. Logika: `src/lib/pristup-pracenje.ts` (+ test).

Link za slanje kolegama (opći kupon za betu, bez pogodnosti, 50 mjesta): `https://logomedo.com/pristup?kupon=LOGOPED-BETA`.

## Gdje

| Što | Gdje |
| --- | --- |
| Tablica | `migrations/0047_kuponi.sql` (`kuponi`; `zahtjevi_pristupa.kupon` = upisani kod) |
| Logika | `src/lib/admin/kuponi.ts`, auto-odobravanje u `src/lib/pristup.ts` (`autoOdobri`), testovi `src/lib/kuponi.test.ts`; ekran nakon odobravanja `src/lib/pristup-pracenje.ts` |
| Stvaranje, link, uključi/isključi | `/admin/uprava/kuponi` (samo superadmin, `rute.ts`) |

## Pravila

- Kod: 4–32 znaka, `A–Z`, brojke, crtica; mala slova i razmaci se normaliziraju (`split 2026` = `SPLIT2026`).
- Ograničenja: najviše N korištenja (`max_koristenja`, broji samo auto-odobrena), datum isteka (vrijedi do kraja
  dana, UTC), isključivanje. Korištenje se zauzima atomski, pa dva istodobna obrasca ne prelaze limit.
- Uz kupon može ići **pogodnost nakon bete** (docs/pogodnosti.md); upiše se kad je pozivnica izdana,
  `dodijelio = kupon:KOD`.
- **Kod koji ne vrijedi ne javlja grešku** (ne postoji, isključen, istekao, potrošen, ili kupon bez auto-odobravanja):
  zahtjev se spremi kao običan, s upisanim kodom, superadmin dobije obavijest. Tako se kodovi ne mogu pogađati mimo
  limita od 3 zahtjeva na sat po IP-u.
- Narudžba za **ustanovu** se nikad ne odobrava sama (treba ponudu za više licenci).
- Ako za isti e-mail već postoji otvoren zahtjev, kupon odobrava taj.
- Ako pozivnica ne ode (Resend), zahtjev se vraća u red (`novi`), korištenje se oslobađa i osoba vidi običan
  „Hvala”. Izdani link nitko ne zna; ručno „Odobri” izdaje novi i stari poništava.
- Ako osoba već ima aktivan račun (`aktivan_logoped`), zahtjev ostaje u redu kao i kod ručnog odobravanja.

Kuponi nisu popust na cijenu: to je posao checkouta (docs/pogodnosti.md, „Što još nije”).
