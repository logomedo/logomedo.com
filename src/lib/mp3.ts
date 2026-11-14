// Rezanje MP3 po okvirima (bez dekodiranja), za izgovor „izrezan iz rečenice” (docs/zvukovi.md).
// ElevenLabs vraća CBR MPEG-1 Layer III; svaki okvir je 1152 uzorka.

interface Okvir { od: number; duljina: number; uzoraka: number; hz: number }

const KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const HZ = [44100, 48000, 32000];

/** Okviri MPEG-1 Layer III redom. Ostalo (ID3, smeće) preskače. */
export function okviri(b: Uint8Array): Okvir[] {
  const out: Okvir[] = [];
  let i = 0;
  while (i + 4 <= b.length) {
    // Sync 11 bita, MPEG-1 (11), Layer III (01).
    if (b[i] === 0xff && (b[i + 1] & 0xfe) === 0xfa) {
      const kbps = KBPS[b[i + 2] >> 4], hz = HZ[(b[i + 2] >> 2) & 3];
      if (kbps && hz) {
        const duljina = Math.floor((144000 * kbps) / hz) + ((b[i + 2] >> 1) & 1);
        if (i + duljina <= b.length) { out.push({ od: i, duljina, uzoraka: 1152, hz }); i += duljina; continue; }
      }
    }
    i++;
  }
  return out;
}

const imaOznaku = (b: Uint8Array, o: Okvir) => {
  const t = new TextDecoder("latin1").decode(b.subarray(o.od, o.od + Math.min(o.duljina, 64)));
  return t.includes("Xing") || t.includes("Info");
};

/**
 * Samo okviri od `odSekunde` (minus mala zaliha) do kraja. Okvir s Xing/Info oznakom se izbacuje,
 * jer bi njegov broj okvira lagao o trajanju. Prvi okvir zna zvučati krivo (bit reservoir), pa
 * zaliha od ~50 ms pada u tišinu prije riječi.
 */
export function izrezi(mp3: ArrayBuffer | Uint8Array, odSekunde: number, zaliha = 0.05): Uint8Array {
  const b = mp3 instanceof Uint8Array ? mp3 : new Uint8Array(mp3);
  let uzoraka = 0;
  const dijelovi: Uint8Array[] = [];
  for (const o of okviri(b)) {
    // Cijeli broj uzoraka, da zbrajanje razlomaka ne pomakne granicu okvira.
    const pocetak = uzoraka / o.hz;
    uzoraka += o.uzoraka;
    if (imaOznaku(b, o) || pocetak < odSekunde - zaliha - 1e-9) continue;
    dijelovi.push(b.subarray(o.od, o.od + o.duljina));
  }
  const out = new Uint8Array(dijelovi.reduce((n, d) => n + d.length, 0));
  let n = 0;
  for (const d of dijelovi) { out.set(d, n); n += d.length; }
  return out;
}
