// PDF u pregledniku: dohvati fontove i slike, smanji slike, složi PDF i ponudi datoteku.
// Učitava se dinamički (import()) tek na klik, jer pdf-lib + fontkit imaju ~1 MB.
//
// Slike s CDN-a idu kroz /cdn/<ključ> na istom originu: cdn.logomedo.com nema CORS, a
// CSP stranice dopušta fetch samo na 'self'. Svaka se smanji na ≤ 800 px i spremi kao
// JPEG (A4 okvir od ~40 mm je ~470 px na 300 dpi), pa PDF ima stotine KB, ne desetke MB.

import { napraviPdf, type FontoviPdf } from "./ispis-pdf.ts";
import { SIVA, slikeDokumenta, velikeSlike, type DokumentPdf } from "./model.ts";

const NAJVISE_PX = 800;
/** Pozadina scene je ~180 mm široka: 1800 px je ~250 dpi. */
const NAJVISE_PX_VELIKE = 1800;

let fontovi: Promise<FontoviPdf> | null = null;
let andika: Promise<Uint8Array> | null = null;
/** Andika za znakove (slova, brojke) samo kad ih dokument ima: datoteka ima ~0,7 MB. */
function ucitajAndiku(dok: DokumentPdf): Promise<Uint8Array | undefined> {
  if (!JSON.stringify(dok.stranice).includes('"znak":true')) return Promise.resolve(undefined);
  andika ??= fetch("/fonts/andika-700.ttf").then(async (r) => { if (!r.ok) throw new Error(`font ${r.status}`); return new Uint8Array(await r.arrayBuffer()); })
    .catch((e: unknown) => { andika = null; throw e; });
  return andika;
}
function ucitajFontove(): Promise<FontoviPdf> {
  const f = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`font ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  };
  fontovi ??= Promise.all([f("/fonts/nunito-800.ttf"), f("/fonts/nunito-900.ttf")])
    .then(([tekst, naslov]) => ({ tekst, naslov }))
    .catch((e: unknown) => { fontovi = null; throw e; });
  return fontovi;
}

/** URL slike koji se smije dohvatiti iz skripte (isti origin). */
export function istiOrigin(url: string): string {
  const u = new URL(url, location.href);
  if (u.origin === location.origin) return u.pathname + u.search;
  return `/cdn${u.pathname}`;
}

async function smanji(url: string, najvise = NAJVISE_PX): Promise<Uint8Array | null> {
  const siva = url.endsWith(SIVA);
  if (siva) url = url.slice(0, -SIVA.length);
  try {
    const r = await fetch(istiOrigin(url));
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob());
    const k = Math.min(1, najvise / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); // PNG s prozirnošću → bijela podloga
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    if (siva) {
      // Ručno, ne ctx.filter: Safari ga na canvasu dugo nije podržavao.
      const px = g.getImageData(0, 0, c.width, c.height);
      const d = px.data;
      for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      g.putImageData(px, 0, 0);
    }
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.88));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null; // slika koja ne stigne ostaje prazan okvir, PDF se svejedno složi
  }
}

/** Složi PDF i ponudi ga za preuzimanje. `napredak(gotovo, ukupno)` za tekst gumba. */
export async function preuzmiPdf(dok: DokumentPdf, imeDatoteke: string, napredak?: (gotovo: number, ukupno: number) => void) {
  const urls = slikeDokumenta(dok);
  const velike = velikeSlike(dok);
  const f = ucitajFontove();
  const slike = new Map<string, Uint8Array>();
  let gotovo = 0;
  napredak?.(0, urls.length);
  // Po 6 istodobno: dovoljno brzo, a ne guši mobitel.
  const red = [...urls];
  await Promise.all(Array.from({ length: Math.min(6, red.length) }, async () => {
    for (let u = red.shift(); u; u = red.shift()) {
      const b = await smanji(u, velike.has(u) ? NAJVISE_PX_VELIKE : NAJVISE_PX);
      if (b) slike.set(u, b);
      napredak?.(++gotovo, urls.length);
    }
  }));
  const bajtovi = await napraviPdf(dok, slike, { ...(await f), znak: await ucitajAndiku(dok) });
  const url = URL.createObjectURL(new Blob([bajtovi as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = imeDatoteke;
  // Tipovi Workera prepisuju DOM append (vidi zadaci/klijent.ts), pa kroz any.
  (document.body as any).append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Ime datoteke iz naslova: bez dijakritika i znakova koje sustavi ne vole. */
export function imePdfa(naslov: string): string {
  const s = naslov.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
  return `${s || "logomedo"}.pdf`;
}
