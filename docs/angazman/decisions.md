# Odluke: angažman

Svaka odluka ima broj, datum, razlog i uvjet revizije. Odluka se ne briše nego zamjenjuje novom koja kaže koju
mijenja. Blokovi: S0 1–99, S1 100, S2 200, … S7 700.

## S0 (25. 11. 2026.)

1. **Opseg.** Podsjetnici e-poštom za ljude zapele u lijevku (A/B/C), niz tjedana korištenja, ljestvica uz pristanak.
   Ne radi se: push obavijesti u appu, SMS/WhatsApp, newsletter i masovne kampanje, A/B testiranje. Revizija: kad app
   dobije push (tada segment D i u appu).
2. **Ime i mjesto.** Lanac „angažman”, `docs/angazman/`; kod u `src/lib/angazman/`; Uprava `/admin/uprava/podsjetnici`.
3. **Aktivni dan** = dan (Europe/Zagreb) u kojem je korisnik spremio ili uredio zadatak/bilježnicu, preuzeo PDF,
   pokrenuo „Dijete rješava” ili igru, zatražio slike ili izgovor (web ili `/api/v1`). Sama prijava i gledanje ne
   broje se: niz i ljestvica nagrađuju rad s djecom, ne otvaranje stranice. Spremanje je jedan redak po (korisnik,
   dan) s vrstama i brojem, ne dnevnik događaja: dovoljno za niz i lijevak, a ne prati ponašanje detaljnije nego
   treba. Revizija: S1 ako se pokaže da neka radnja ne ostavlja trag na serveru (npr. PDF nastaje u pregledniku, pa
   treba ping).
4. **Segmenti i kadenca (prijedlog, S1 ga provjerava brojkama):**
   - A: odobren, pozivnica neiskorištena: 4. dan nakon odobrenja nova pozivnica (stara opozvana), 11. dan zadnja;
     zatim ništa.
   - B: račun postoji, nijedan aktivni dan: 2. i 7. dan nakon prve prijave; zatim ništa.
   - C: bio aktivan, 14 dana bez aktivnog dana: jedan mail, ponovno najranije nakon 30 dana, najviše 3 ukupno dok se
     ne vrati.
   - D: samo onima koji su ga uključili (F2).
   Revizija: S1 (stvarna razdioba), kasnije nakon prvog mjeseca na produkciji (otvaranja ne mjerimo, vidi 9).
5. **Globalna pravila slanja** (čista funkcija, svako s testom): najviše 1 podsjetnik po osobi u 7 dana; nikad
   superadminima (ADMIN_EMAILS) ni adminima; nikad nakon odjave; nikad ako je osoba odbijena ili joj je zahtjev
   obrisan retencijom; prednost A > B > C kad se poklope; najviše `PODSJETNICI_PO_POKRETANJU` po pokretanju (ostatak
   sutra). Revizija: nikad bez nove odluke.
6. **Vrijeme slanja.** Cron Trigger radnim danom jednom ujutro (Cloudflare cron je UTC, pa se 9–10 h po Zagrebu
   pomiče sa satom; prihvaćeno). Revizija: S1 ako razdioba aktivnosti kaže drugi dan/sat.
7. **Niz se broji u tjednima**, ne danima: tjedan (pon–ned, Europe/Zagreb) s barem jednim aktivnim danom produžuje
   niz. Logopedi rade po terminima, vikendom i praznicima ne; dnevni niz bi kažnjavao normalan raspored. Uz niz se
   prikazuju aktivni dani u mjesecu. Revizija: S1 ako razdioba pokaže da većina radi svaki dan.
8. **Ljestvica je opt-in** s nadimkom koji korisnik sam upiše (ne ime ni e-mail), rangira aktivne dane u tekućem
   mjesecu (ne broj zadataka, da se ne isplati „spamati”), prikazuje top 20 i vlastito mjesto; skrivena dok ima
   manje od `LJESTVICA_MIN` (prijedlog 5) sudionika; superadmini nisu na njoj. Revizija: S6.
9. **Bez praćenja otvaranja i klikova** (Resend open/click tracking isključen, bez pixela): manje podataka, manje
   pravnog teksta, a uspjeh se mjeri onim što zanima: je li se osoba nakon maila prijavila ili napravila zadatak
   (`aktivni_dani` nakon `podsjetnici.poslano_at`). Revizija: korisnik traži.
10. **Odjava.** Svaka poruka ima potpisan link za odjavu (bez prijave) i zaglavlja `List-Unsubscribe` +
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Odjava gasi sve podsjetnike, ne i transakcijske mailove
    (pozivnica na zahtjev, račun, odgovor u inboxu). Može se ponovno uključiti u Postavkama.
11. **Prekidač `PODSJETNICI`** (`iskljuceno` | `suho` | `ukljuceno`) kao var u `wrangler.jsonc` po okruženju; `suho`
    računa i upisuje u `podsjetnici` s ishodom `suho`, ne šalje. Produkcija ostaje `iskljuceno` do S7.
12. **Radna kopija i grana.** Lanac radi u `/Users/ms/git/logomedo/logomedo.com-landing` na grani `angazman` (iz
    `origin/main`); `logomedo.com/` (main) je radna kopija drugih sesija. Staging deploy s grane je dopušten;
    `main` i produkcija tek u S7 (ili kad korisnik kaže). Revizija: korisnik želi ranije spajanje.
