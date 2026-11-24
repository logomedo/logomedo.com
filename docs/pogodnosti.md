# Pogodnosti nakon bete

Od 24. 11. 2026. (landing odluka 815). Cjenik je na `/cijene` (odluke 813, 814): 10 € mjesečno, 100 € godišnje,
250 € doživotno, s PDV-om. Plaćanje još ne postoji; dok traje beta, svi s računom koriste LogoMedo besplatno.

**Pogodnost** je ono što superadmin nekome privatno obeća za vrijeme nakon bete: *N mjeseci besplatno* (1–36) ili
*trajno besplatno*. To nije kupon platnog servisa nego pravo na pristup bez plaćanja, zapisano kod nas.

## Gdje

| Što | Gdje |
| --- | --- |
| Tablica | `migrations/0045_pogodnosti.sql` (`pogodnosti`, jedna važeća po e-mailu, povijest kroz `opozvana_at`) |
| Logika | `src/lib/admin/pogodnosti.ts` (+ `.test.ts`) |
| Dodjela uz pozivnicu | `/admin/zahtjevi`: padajući izbornik i napomena uz „Odobri”; upiše se tek kad je pozivnica izdana |
| Pregled, dodjela po e-mailu, uklanjanje | `/admin/pogodnosti` (samo superadmin, `rute.ts`) |
| Korisnik vidi svoju | `/admin/postavke`, kartica „Nakon bete” (bez napomene) |

Pogodnost je po e-mailu, pa se može dati i osobi koja još nema račun. Promjena e-maila u profilu je prenosi
(`profil.ts` `STUPCI_EMAILA`).

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
