// Klon glasa (docs/klon-glasa.md): tekst za čitanje i ocjena snimke. Čisti TS (+ test), bez `cloudflare:workers`.
import { GLASOVI } from "./zadaci/slusanje.ts";

/**
 * Odlomci za čitanje. Zajedno ~2 min (ElevenLabs Instant: 1–2 min, ne više od 3), svaki 15–25 s.
 * Isti tonovi koje klon kasnije treba: upute djetetu, pohvala, priča, naracija videa. Zajedno pokrivaju
 * svih 30 glasova (test), i Č/Ć, DŽ/Đ, LJ/NJ, IJE jedno uz drugo, jer na njima stranim glasovima pada izgovor.
 */
export const ODLOMCI: { naslov: string; tekst: string }[] = [
  { naslov: "Pozdrav", tekst: "Dobar dan! Drago mi je što ste tu. Danas ćemo zajedno slušati, ponavljati i igrati se riječima. Polako, bez žurbe, jedan glas za drugim." },
  { naslov: "Upute djetetu", tekst: "Poslušaj pažljivo. Koju riječ čuješ? Pokaži sliku na kojoj je ježić. Bravo, to je točno! Sada pronađi čašu, džep i šešir. Odlično ti ide!" },
  { naslov: "Priča", tekst: "Jednog sunčanog jutra mali medo krenuo je u šumu. Na putu je sreo žabu, zeca i vjevericu. Žaba je skakala preko lišća, zec je grickao mrkvu, a vjeverica je skupljala lješnjake za zimu." },
  { naslov: "Slični glasovi", tekst: "Đak je u džepu nosio dvije olovke i bijelu bilježnicu. Ćup je pun meda, a njuška psića viri iza ljuljačke. Čuješ li razliku? Čaša i ćup. Džem i đak. Fazan i hobotnica." },
  { naslov: "Brojimo", tekst: "Koliko jabuka ima na stablu? Jedna, dvije, tri, četiri, pet. A koliko je krušaka u košari? Šest, sedam, osam. Izbroji ih još jednom, polako i glasno." },
  { naslov: "Naracija", tekst: "LogoMedo je pametan alat za vježbe govora. Odaberete glas, slike i vrstu zadatka, a radni listić je spreman za ispis u nekoliko sekundi. Dijete može vježbati i na tabletu, uz igru i pohvale." },
  { naslov: "Završetak", tekst: "Svaka vježba je mali korak naprijed. Ponekad ide teško, a ponekad lako, i to je sasvim u redu. Važno je da se igramo, smijemo i ne odustajemo. Vidimo se sutra!" },
];

/** Glasovi iz GLASOVI koje tekst sadrži (DŽ, LJ, NJ kao jedan glas, pa njihova slova ne broje D, Ž, L, N, J). */
export function glasoviUTekstu(tekst: string): Set<string> {
  const t = tekst.normalize("NFC").toLocaleUpperCase("hr");
  const ima = new Set<string>();
  for (let i = 0; i < t.length; i++) {
    const dva = t.slice(i, i + 2);
    if (dva === "DŽ" || dva === "LJ" || dva === "NJ") { ima.add(dva); i++; continue; }
    if (GLASOVI.includes(t[i])) ima.add(t[i]);
  }
  return ima;
}

/** Mjerenja snimke u pregledniku (dBFS). `klipova` je broj uzoraka na |x| ≥ 0,999 prije pojačanja. */
export interface Mjerenje { trajanje: number; vrhDb: number; rmsDb: number; sumDb: number; klipova: number; pauza: number }

/** ElevenLabs: RMS −23 do −18 dB, vrh −3 dB, bez šuma i dugih pauza; svaka datoteka ≥ 5 s. */
export function upozorenja(m: Mjerenje): string[] {
  const u: string[] = [];
  if (m.trajanje < 5) u.push("Kraće od 5 s: ElevenLabs takvu snimku ne uzima.");
  if (m.klipova > 0) u.push("Izobličeno (preglasno na ulazu): odmakni se od mikrofona ili smanji pojačanje.");
  if (m.rmsDb < -26) u.push("Pretiho u prosjeku: govori bliže mikrofonu (dvije šake).");
  if (m.rmsDb > -15) u.push("Preglasno u prosjeku.");
  if (m.sumDb > -50) u.push("Šum u tišini: ugasi ventilator, zatvori prozor, probaj drugu sobu.");
  if (m.pauza > 1.5) u.push(`Pauza od ${m.pauza.toFixed(1)} s: klon preuzima i pauze, snimi odlomak u jednom dahu.`);
  return u;
}

/** Ukupno trajanje uzoraka za Instant klon: 60–180 s je dobro. */
export function ocjenaTrajanja(s: number): { ok: boolean; poruka: string } {
  if (s < 10) return { ok: false, poruka: "Treba barem 10 s, a za dobar klon 1–2 minute." };
  if (s < 60) return { ok: true, poruka: "Može, ali klon je bolji s barem 1 minutom." };
  if (s <= 180) return { ok: true, poruka: "Odlično: 1–3 minute." };
  return { ok: true, poruka: "Više od 3 min: Instant klon zna postati nestabilan. Isključi slabije snimke." };
}
