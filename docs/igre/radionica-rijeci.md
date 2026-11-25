# Radionica riječi: koncept nove vrste igre

Stanje 25. 11. 2026.: **prototip, nije u aplikaciji.** Izvor prototipa je
[`radionica-rijeci-prototip.html`](radionica-rijeci-prototip.html) (samostalna stranica,
objavljena kao privatni Claude artefakt; URL je u lokalnoj memoriji, ne ovdje).

## Ideja

Mehanika stola za izradu iz igara tipa „crafting”: mreža 3×3 i deseto, izlazno polje.
Dijete slaže pločice sa slovima na stol, a kad slova čine riječ, na izlaznom polju
nastane predmet (slika riječi). Ideju je dao dijete-igrač, a dorađena je kroz njegov
feedback (vidi „Odluke”).

## Pravila igre u prototipu

- **Čitanje stola:** slijeva nadesno, red po red, prazna polja se preskaču. U praznim
  poljima su blijede brojke 1–9 koje pokazuju redoslijed.
- **Zadaci:** slika + broj slova; niz od 5 riječi; razine kratke (≤3 pločice),
  srednje (4–5), duge (6+). „Poslušaj” izgovara riječ, „Pokaži recept” prikazuje blijeda
  slova u poljima.
- **Slobodno:** svih 30 slova, beskonačno; svaka prava riječ otključa se u Knjizi
  recepata (neotkrivene su siluete s brojem slova).
- **Škrinja:** skupljene riječi s brojem.
- **Kovanje:** kad je riječ dobra, čekić dvaput lupi u stol (zvuk, trešnja, iverice),
  tek onda se riječ pojavi u izlaznom polju s „×1”; dodir je šalje u škrinju.
- Riječ koja nije zadana, ali je u rječniku, ide u škrinju kao bonus.

## Logopedski dio

- LJ, NJ, DŽ su jedna pločica (jedan glas), tokenizacija `tok()` u prototipu.
- Samoglasnici su zelene pločice, suglasnici svijetle.
- Ometala u ladici biraju se prvo iz parova koje djeca miješaju (S/Š/Z/Ž, C/Č/Ć, R/L,
  LJ/L/NJ, DŽ/Đ, B/P, D/T, K/G, V/F), mapa `CONF`.
- Sva prava slova u krivom redu → izlaz „?” i poruka „pročitaj stol kao knjiga”.

## Odluke (feedback igrača, 25. 11.)

| Prijedlog | Odluka |
|---|---|
| Boje trave, zemlje i drveta, kockasti uglovi | da |
| Stol kao predmet (noge) + čekić koji lupi kad nastane riječ | da; čekić povećan |
| Polja potpuno četvrtasta i udubljena, izlaz veći, „×1” | da |
| Kockasta strelica | ne treba (strelica samo zasvijetli) |
| Povlačenje prstom | da; pločica lebdi ~48 px iznad prsta, dodir i dalje radi |

## Granica: nije Minecraft

Mehanika (mreža za izradu) i opće boje prirode su slobodne. **Ne koristimo** ime
Minecraft, njegove likove, piksel-teksture, piksel-font, sivi prozor inventara ni
kocku trave. Aplikacija se plaća, pa bi preslikani izgled bio i pravni rizik
(brand pravila Mojanga). Likovi, ako ih bude, su vlastiti (Medo).

## Otvoreno

1. Je li važan **oblik** (riječ mora biti u jednom redu/stupcu) ili samo redoslijed?
2. Riječi kao **sastojci** novih (SNIJEG + ČOVJEK → SNJEGOVIĆ, SUNCE + KIŠA → DUGA)?
3. **Slogovi** umjesto slova kao lakša razina (MA + MA → MAMA)?
4. Prijenos u aplikaciju: slike iz kataloga umjesto emojija, izgovor kroz ElevenLabs
   (`docs/zvukovi.md`), riječi po glasovima kao kod ostalih vrsta (`docs/zadaci.md`).
5. Položaj čekića na mobitelu nije provjeren u pregledniku (može prekriti mrežu).
