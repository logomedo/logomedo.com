# Pogodnosti nakon bete

Od 24. 11. 2026. (landing odluka 815). Cjenik je na `/cijene` (odluke 813, 814): 10 € mjesečno, 100 € godišnje,
250 € doživotno, s PDV-om. Od odluke 816 cjenik vrijedi odmah (vidi „Narudžbe” niže); besplatni beta pristup se i dalje
traži zahtjevom i odobrava ručno.

**Pogodnost** je ono što superadmin nekome privatno obeća za vrijeme nakon bete: *N mjeseci besplatno* (1–36) ili
*trajno besplatno*. To nije kupon platnog servisa nego pravo na pristup bez plaćanja, zapisano kod nas.

## Gdje

| Što | Gdje |
| --- | --- |
| Tablica | `migrations/0045_pogodnosti.sql` (`pogodnosti`, jedna važeća po e-mailu, povijest kroz `opozvana_at`) |
| Logika | `src/lib/admin/pogodnosti.ts` (+ `.test.ts`) |
| Dodjela uz pozivnicu | `/admin/uprava/zahtjevi`: padajući izbornik i napomena uz „Odobri”; upiše se tek kad je pozivnica izdana |
| Pregled, dodjela po e-mailu, uklanjanje | `/admin/uprava/pogodnosti` (samo superadmin, `rute.ts`) |
| Korisnik vidi svoju | `/admin/postavke`, kartica „Nakon bete” (bez napomene) |

Pogodnost je po e-mailu, pa se može dati i osobi koja još nema račun. Promjena e-maila u profilu je prenosi
(`profil.ts` `STUPCI_EMAILA`).

## Narudžbe i licence za ustanove (odluka 816)

- Licenca je za **jednu osobu** (piše na `/cijene` i u `/uvjeti`); više ljudi = više licenci.
- Narudžba ide kroz isti obrazac `/pristup?paket=mjesecno|godisnje|dozivotno|ustanova|beta` (0046: `paket`,
  `broj_licenci` 1–1000 u `zahtjevi_pristupa`). `/admin/uprava/zahtjevi` pokazuje paket, broj licenci i cijenu.
- Ustanove (godišnje licence, `LICENCE_USTANOVE` u `src/landing/konstante.ts`): 1–4 puna cijena, 5–9 −10 %,
  10–24 −15 %, 25–49 −20 %, 50+ po dogovoru. Ponudu i račun (osnovica + PDV) izdaje ITalk, plaćanje virmanom.
- Tijek dok nema kartice: obrazac → ručno pošalji račun/ponudu → kad uplata stigne, „Odobri” (izdaje pozivnicu).
  „Kupnja = pristup bez odobravanja” tek s checkoutom; landing to iskreno kaže („kartica uskoro”).

## Što još nije (checkout)

- **Mjeseci se broje od početka naplate**, ne od dodjele. Kad checkout postoji: korisnik s pogodnošću `mjeseci`
  dobije pretplatu s probnim razdobljem od N mjeseci (ili kupon 100 % na N mjeseci); `trajno` ne ide u checkout.
- **Kuponi za popust** (npr. prva 3 mjeseca po 1 €, prvi mjesec gratis) su posao platnog servisa (Stripe /
  Paddle / Lemon Squeezy imaju kupone i promo kodove: postotak ili iznos, jednom / N mjeseci / zauvijek, limit
  korištenja, istek). Za privatno slanje: osobni link `/cijene?kod=…` s već primijenjenim kodom; polje „Imate kod?”
  samo u checkoutu, ne na landingu.
- Otvoreno pitanje prije checkouta: račun izdaje ITalk d.o.o. → kartično plaćanje vjerojatno znači fiskalizaciju;
  alternativa je merchant of record (Paddle, Lemon Squeezy) koji sam izdaje račun kupcu. Nije provjereno.
- E-mail pozivnice pogodnost ne spominje (predložak `emails/`); može se dodati.

## Vezani dokumenti

- `docs/kuponi.md`: kuponi na `/pristup` (auto-odobravanje, uz kupon može ići pogodnost).
