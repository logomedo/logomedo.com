# Kuponi na /pristup

Od 25. 11. 2026. Kupon je kod koji osoba upiše u obrazac `/pristup` (polje „Kupon”) ili dobije u linku
`/pristup?kupon=KOD` (kod je tada već upisan, a naslov kaže „Pristup s kuponom”).

**Auto-odobravanje:** kupon s kvačicom „Auto-odobri” sam odobrava zahtjev: odmah se izdaje pozivnica i šalje
e-poštom (kao „Odobri” na `/admin/uprava/zahtjevi`), a osoba vidi „Pristup je odobren” (`/pristup?poslano=kupon`).
Superadmin ne mora ništa kliknuti; u „Zadnjim obrađenima” stoji `Obradio: kupon:KOD`.

## Gdje

| Što | Gdje |
| --- | --- |
| Tablica | `migrations/0047_kuponi.sql` (`kuponi`; `zahtjevi_pristupa.kupon` = upisani kod) |
| Logika | `src/lib/admin/kuponi.ts`, auto-odobravanje u `src/lib/pristup.ts` (`autoOdobri`), testovi `src/lib/kuponi.test.ts` |
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
