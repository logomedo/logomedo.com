// Širina i visina slike iz zaglavlja (PNG, JPEG, WebP), bez dekodiranja. Server iz toga
// zna orijentaciju pozadine i ne vjeruje onome što pošalje preglednik.

export interface Dimenzije { sirina: number; visina: number }

export function dimenzije(b: Uint8Array): Dimenzije | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const ascii = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  // PNG: potpis + IHDR, širina i visina big-endian na 16 i 20
  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 3) === "PNG") return { sirina: v.getUint32(16), visina: v.getUint32(20) };
  // JPEG: segmenti do SOFn (C0–CF osim C4, C8, CC)
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const m = b[o + 1];
      if (m === 0xff) { o++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
      const duljina = v.getUint16(o + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { visina: v.getUint16(o + 5), sirina: v.getUint16(o + 7) };
      o += 2 + duljina;
    }
    return null;
  }
  // WebP: RIFF....WEBP + VP8 / VP8L / VP8X
  if (b.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const vrsta = ascii(12, 4);
    if (vrsta === "VP8 ") return { sirina: v.getUint16(26, true) & 0x3fff, visina: v.getUint16(28, true) & 0x3fff };
    if (vrsta === "VP8L") {
      const x = v.getUint32(21, true);
      return { sirina: (x & 0x3fff) + 1, visina: ((x >> 14) & 0x3fff) + 1 };
    }
    if (vrsta === "VP8X") {
      const u24 = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
      return { sirina: u24(24) + 1, visina: u24(27) + 1 };
    }
  }
  return null;
}

export const orijentacija = (d: Dimenzije): "uspravno" | "vodoravno" => (d.visina > d.sirina ? "uspravno" : "vodoravno");
