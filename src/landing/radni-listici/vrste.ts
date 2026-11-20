// R-3 Vrste zadataka (sadrzaj.md 3.3): 11 kartica, broj mora biti BROJKE.vrstaZadataka (test).
// Slušne vrste rade na papiru, a u igri su „uskoro” (odluka 203).
export interface VrstaZadatka { naslov: string; tekst: string; uskoroUIgri?: boolean }

export const VRSTE_ZADATAKA: VrstaZadatka[] = [
  { naslov: "Radni listić", tekst: "Naslov i niz slika s riječi ispod, po glasu i poziciji." },
  {
    naslov: "Prebrajanje",
    tekst: "Ispod slike su kružići; dijete oboji onoliko koliko riječ ima slogova ili glasova. Ili dugačke i kratke riječi zaokruži dvjema bojama.",
  },
  {
    naslov: "Uparivanje",
    tekst: "Zadana je jedna slika, ispod su tri. Dijete bira onu koja se rimuje, počinje istim glasom ili slogom ili završava istim glasom.",
  },
  { naslov: "Povezivanje", tekst: "Dva stupca slika; dijete povezuje parove po rimi, prvom glasu, slogu ili zadnjem glasu, ili slovo sa slikom." },
  { naslov: "Izbaci uljeza", tekst: "Četiri slike u redu: tri idu zajedno, jedna ne." },
  { naslov: "Scena", tekst: "Ilustracija situacije; dijete bira sve slike koje joj pripadaju." },
  {
    naslov: "Vizualna percepcija",
    tekst: "Nađi onu koja je drukčija ili dvije iste: zrcaljeno, naopako, okrenuto, manje. Radi i sa slovima.",
  },
  { naslov: "Prvi glas (kolo slova)", tekst: "Dijete zavrti kolo sa slovima i među 12–15 slika nađe sve koje počinju tim glasom." },
  {
    naslov: "Razvrstavanje",
    tekst: "4 do 12 slika u dvije do četiri vreće, košare ili kutije: po prvom ili zadnjem glasu, broju slogova ili broju glasova.",
  },
  { naslov: "Koje slovo čuješ?", tekst: "Vi izgovorite glas, a dijete na listiću pronađe slovo koje je čulo.", uskoroUIgri: true },
  {
    naslov: "Gdje je glas?",
    tekst: "Ispod slike tri kruga: dijete označi je li glas na početku, u sredini ili na kraju.",
    uskoroUIgri: true,
  },
];
