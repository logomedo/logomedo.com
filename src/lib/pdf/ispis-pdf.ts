// Radni listić / bilježnica kao PDF, složen u pregledniku (pdf-lib + fontkit, isti pristup
// kao potvrda u energy.domovina.ai). Čista funkcija nad bajtovima fontova i slika: radi i
// u testu (node) i u pregledniku, bez dijaloga za ispis i bez mreže u trenutku slaganja.
//
// Raspored prati HTML ispis (/b/<slug>/ispis i pogled „Ispis" u editoru): A4, mjere u mm.
// Fontovi (Nunito 800/900, OFL) ugrađuju se kao podskup, pa hrvatska slova rade svugdje.

import { degrees, PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Izmjena } from "../zadaci/vrste.ts";
import fontkit from "@pdf-lib/fontkit";
import { TEME } from "../teme.ts";
import { GRANCICA } from "../ukrasi.ts";
import type { DokumentPdf, SlikaPdf, StranicaPdf } from "./model.ts";
import { nacrtajSvg, omjer } from "./svg.ts";

export interface FontoviPdf { tekst: Uint8Array; naslov: Uint8Array }
/** Slika po URL-u: JPEG ili PNG bajtovi (preglednik ih prije smanji, vidi preglednik.ts). */
export type SlikePdf = Map<string, Uint8Array>;

const MM = 72 / 25.4;
const A4 = { w: 210, h: 297 };
const TINTA = rgb(0x1d / 255, 0x19 / 255, 0x14 / 255);
const BLIJEDO = rgb(0x9a / 255, 0x90 / 255, 0x7f / 255);
const BEZ = rgb(0x5c / 255, 0x53 / 255, 0x45 / 255);
const BIJELO = rgb(1, 1, 1);
const CRNO = rgb(0, 0, 0);

/** Crtanje u mm s ishodištem gore lijevo (pdf-lib ima točke i ishodište dolje lijevo). */
class Platno {
  page: PDFPage;
  private f: { tekst: PDFFont; naslov: PDFFont };
  constructor(page: PDFPage, f: { tekst: PDFFont; naslov: PDFFont }) { this.page = page; this.f = f; }
  X = (mm: number) => mm * MM;
  Y = (mm: number) => (A4.h - mm) * MM;

  sirina(t: string, pt: number, naslov = false) { return (naslov ? this.f.naslov : this.f.tekst).widthOfTextAtSize(t, pt) / MM; }

  /** Tekst centriran oko `cx`; `y` je vrh retka. Vraća visinu u mm. */
  tekst(t: string, cx: number, y: number, pt: number, o: { naslov?: boolean; boja?: ReturnType<typeof rgb>; sirina?: number; poravnanje?: "c" | "l" | "d" } = {}) {
    const font = o.naslov ? this.f.naslov : this.f.tekst;
    const redovi = o.sirina ? prelomi(t, (s) => this.sirina(s, pt, o.naslov), o.sirina) : [t];
    const razmak = (pt * 1.25) / MM;
    redovi.forEach((r, i) => {
      const w = this.sirina(r, pt, o.naslov);
      const x = o.poravnanje === "l" ? cx : o.poravnanje === "d" ? cx - w : cx - w / 2;
      // Osnovna crta je ~0.8 visine fonta ispod vrha retka.
      this.page.drawText(r, { x: this.X(x), y: this.Y(y + i * razmak + (pt * 0.95) / MM), size: pt, font, color: o.boja ?? TINTA });
    });
    return redovi.length * razmak;
  }

  /** Zaobljeni pravokutnik (x, y gore lijevo, mm). */
  okvir(x: number, y: number, w: number, h: number, r: number, debljinaPt: number) {
    const d = `M${r} 0 H${w - r} Q${w} 0 ${w} ${r} V${h - r} Q${w} ${h} ${w - r} ${h} H${r} Q0 ${h} 0 ${h - r} V${r} Q0 0 ${r} 0 Z`;
    this.page.drawSvgPath(d, { x: this.X(x), y: this.Y(y), scale: MM, color: BIJELO, borderColor: CRNO, borderWidth: debljinaPt / MM });
  }

  crtkano(x1: number, y: number, x2: number, debljinaPt: number) {
    this.page.drawLine({ start: { x: this.X(x1), y: this.Y(y) }, end: { x: this.X(x2), y: this.Y(y) }, thickness: debljinaPt, color: CRNO, dashArray: [4, 3] });
  }

  crta(x1: number, y: number, x2: number) {
    this.page.drawLine({ start: { x: this.X(x1), y: this.Y(y) }, end: { x: this.X(x2), y: this.Y(y) }, thickness: 0.75, color: CRNO });
  }

  tocka(cx: number, cy: number, r: number) {
    this.page.drawCircle({ x: this.X(cx), y: this.Y(cy), size: r * MM, color: CRNO });
  }

  slika(img: PDFImage, x: number, y: number, w: number, h: number, izmjena: Izmjena = "") {
    const m = smjestiSliku(img.width, img.height, { x: this.X(x), y: this.Y(y + h), w: w * MM, h: h * MM }, izmjena);
    this.page.drawImage(img, { ...m, rotate: degrees(m.kut) });
  }
}

/**
 * Gdje pdf-lib crta sliku da bude kao `object-fit: contain` + CSS transform iz `izmjenaCss`:
 * okrenuta/zrcaljena oko središta okvira. Okvir je u PDF točkama (x, y = donji lijevi kut).
 * pdf-lib crta jedinični kvadrat kroz translate → rotate → scale, pa se početak računa iz
 * središta. CSS rotate(90deg) ide u smjeru kazaljke, a PDF kut suprotno (os y gleda gore).
 */
export function smjestiSliku(sirina: number, visina: number, o: { x: number; y: number; w: number; h: number }, izmjena: Izmjena = "") {
  const kut = izmjena === "naopako" ? 180 : izmjena === "lijevo" ? 90 : izmjena === "desno" ? -90 : 0;
  const okomito = kut !== 0 && kut !== 180;
  let k = okomito ? Math.min(o.w / visina, o.h / sirina) : Math.min(o.w / sirina, o.h / visina);
  if (izmjena === "mala") k *= 0.68;
  const sw = sirina * k * (izmjena === "zrcalo" ? -1 : 1), sh = visina * k;
  const r = (kut * Math.PI) / 180, cos = Math.round(Math.cos(r)), sin = Math.round(Math.sin(r));
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  return { x: cx - (cos * sw - sin * sh) / 2, y: cy - (sin * sw + cos * sh) / 2, width: sw, height: sh, kut };
}

/** Prelamanje po riječima (naslovi i upute su kratki, pa jednostavno mjerenje dosta). */
export function prelomi(t: string, mjeri: (s: string) => number, sirina: number): string[] {
  const out: string[] = [];
  let red = "";
  for (const r of t.split(/\s+/).filter(Boolean)) {
    const pokus = red ? `${red} ${r}` : r;
    if (red && mjeri(pokus) > sirina) { out.push(red); red = r; } else red = pokus;
  }
  if (red) out.push(red);
  return out.length ? out : [""];
}

export async function napraviPdf(dok: DokumentPdf, slike: SlikePdf, fontovi: FontoviPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(dok.naslov);
  pdf.setCreator("logomedo.com");
  pdf.setProducer("logomedo.com");
  pdf.setLanguage("hr");
  const f = {
    tekst: await pdf.embedFont(fontovi.tekst, { subset: true }),
    naslov: await pdf.embedFont(fontovi.naslov, { subset: true }),
  };

  // Svaka slika se ugrađuje jednom, koliko god se puta pojavila.
  const ugradene = new Map<string, PDFImage | null>();
  const ugradi = async (url: string | null) => {
    if (!url) return null;
    if (ugradene.has(url)) return ugradene.get(url)!;
    const b = slike.get(url);
    let img: PDFImage | null = null;
    if (b) {
      try { img = b[0] === 0x89 ? await pdf.embedPng(b) : await pdf.embedJpg(b); } catch { img = null; }
    }
    ugradene.set(url, img);
    return img;
  };

  const nova = () => {
    const p = new Platno(pdf.addPage([A4.w * MM, A4.h * MM]), f);
    if (dok.ukrasi) {
      const k = 34, r = 4;
      for (const [x, y, zx, zy] of [[r, r, false, false], [A4.w - r - k, r, true, false], [r, A4.h - r - k, false, true], [A4.w - r - k, A4.h - r - k, true, true]] as const)
        nacrtajSvg(p.page, GRANCICA, { x: p.X(x), y: p.Y(y), sirina: k * MM, zrcaliX: zx, zrcaliY: zy });
    }
    return p;
  };
  const podnozje = (p: Platno, poravnanje: "c" | "d") =>
    p.tekst(dok.podnozje, poravnanje === "c" ? A4.w / 2 : A4.w - 15, A4.h - 10, 8, { boja: BLIJEDO, poravnanje });

  /** Slika u okviru s natpisom ispod; `y` je vrh okvira, `s` stranica kvadrata. Vraća ukupnu visinu. */
  const slikaUOkviru = async (p: Platno, sl: SlikaPdf, x: number, y: number, s: number, debljinaPt = 1.1) => {
    p.okvir(x, y, s, s, 4, debljinaPt);
    const img = await ugradi(sl.url);
    if (img) p.slika(img, x + 2, y + 2, s - 4, s - 4, sl.izmjena);
    else {
      // Bez slike: riječ u okviru, smanjena da stane.
      let pt = 14;
      while (pt > 7 && p.sirina(sl.rijec, pt, true) > s - 5) pt -= 0.5;
      p.tekst(sl.rijec, x + s / 2, y + s / 2 - pt / MM / 1.6, pt, { naslov: true, boja: BEZ });
    }
    if (!sl.natpis) return s;
    let pt = 12;
    while (pt > 7 && p.sirina(sl.natpis, pt) > s + 4) pt -= 0.5;
    p.tekst(sl.natpis, x + s / 2, y + s + 1.5, pt);
    return s + 1.5 + (pt * 1.25) / MM;
  };
  const natpisa = (sl: SlikaPdf[]) => (sl.some((x) => x.natpis) ? 7 : 0);

  // ---------- Naslovnica bilježnice ----------
  if (dok.naslovnica) {
    const p = nova();
    const n = dok.naslovnica;
    let y = 28;
    y += p.tekst(n.naslov, A4.w / 2, y, 34, { naslov: true, sirina: 150 }) + 6;
    y += p.tekst(n.uputa, A4.w / 2, y, 14, { sirina: 150 }) + 8;
    const ime = A4.h - 14 - 10;
    const t = TEME[n.tema ?? "bozic"];
    const svg = t.ukras(n.lampica, { zaIspis: true });
    const visina = Math.min(175, ime - 8 - y);
    const sirina = visina / omjer(svg);
    nacrtajSvg(p.page, svg, { x: p.X(A4.w / 2 - sirina / 2), y: p.Y(y + (ime - 8 - y - visina) / 2), sirina: sirina * MM, klase: t.ispisStil });
    imeCrta(p, A4.w / 2, ime, 80, 13, true);
    podnozje(p, "c");
  }

  function imeCrta(p: Platno, x: number, y: number, duljina: number, pt: number, centrirano: boolean) {
    const oznaka = "Ime:";
    const w = p.sirina(oznaka, pt) + 2 + duljina;
    const x0 = centrirano ? x - w / 2 : x;
    p.tekst(oznaka, x0, y, pt, { poravnanje: "l" });
    p.crta(x0 + p.sirina(oznaka, pt) + 2, y + (pt * 1.1) / MM, x0 + w);
  }

  // ---------- Stranice zadataka ----------
  for (const s of dok.stranice) {
    const p = nova();
    const L = dok.ukrasi ? 20 : 15, D = A4.w - L;
    let y = dok.ukrasi ? 22 : 16;
    if (s.naslov) y += p.tekst(s.naslov, L, y, 22, { naslov: true, poravnanje: "l", sirina: D - L }) + 1;
    if (s.uputa) {
      y += dok.ukrasi
        ? p.tekst(s.uputa, A4.w / 2, y, 17, { naslov: true, sirina: D - L - 24 })
        : p.tekst(s.uputa, L, y + 1, 13, { poravnanje: "l", sirina: D - L }) + 1;
    }
    if (s.ime) { imeCrta(p, L, y + 4, 70, 11, false); y += 10; }
    y += 8;
    const dno = A4.h - (dok.ukrasi ? 22 : 18);
    await tijelo(p, s, L, D, y, dno);
    podnozje(p, dok.ukrasi ? "c" : "d");
  }

  async function tijelo(p: Platno, s: StranicaPdf, L: number, D: number, vrh: number, dno: number) {
    const t = s.tijelo;
    const W = D - L, H = dno - vrh;
    // Redovi raspoređeni po visini kao `justify-content: space-around`.
    const raspodijeli = (n: number, visinaReda: number, max: number) => {
      const razmak = Math.min(max, (H - n * visinaReda) / n);
      const pocetak = vrh + (H - n * (visinaReda + razmak)) / 2 + razmak / 2;
      return Array.from({ length: n }, (_, i) => pocetak + i * (visinaReda + razmak));
    };

    if (t.vrsta === "odabir") {
      const z = 38, s3 = 32, g = 6, c = 8;
      const sirinaReda = z + g + c + g + 3 * s3 + 2 * g;
      const x0 = L + (W - sirinaReda) / 2;
      const nat = natpisa(t.redovi.flatMap((r) => [r.zadana, ...r.ponudeno]));
      const ys = raspodijeli(t.redovi.length, z + nat, 30);
      for (const [i, r] of t.redovi.entries()) {
        const y = ys[i];
        await slikaUOkviru(p, r.zadana, x0, y, z, 2.25);
        p.crtkano(x0 + z + g, y + z / 2, x0 + z + g + c, 1.5);
        for (const [j, sl] of r.ponudeno.entries()) await slikaUOkviru(p, sl, x0 + z + 2 * g + c + j * (s3 + g), y + (z - s3) / 2, s3);
      }
    }

    if (t.vrsta === "uljez") {
      const s4 = 37;
      const razmak = (W - 4 * s4) / 3;
      const ys = raspodijeli(t.redovi.length, s4 + natpisa(t.redovi.flat()), 25);
      for (const [i, red] of t.redovi.entries())
        for (const [j, sl] of red.entries()) await slikaUOkviru(p, sl, L + j * (s4 + razmak), ys[i], s4);
    }

    if (t.vrsta === "percepcija") {
      // Do 6 slika u redu: kvadrat se smanji da stane, red je centriran.
      const g = 5;
      const ys = raspodijeli(t.redovi.length, 37, 25);
      for (const [i, red] of t.redovi.entries()) {
        const s = Math.min(37, (W - (red.length - 1) * g) / red.length);
        const x0 = L + (W - (red.length * s + (red.length - 1) * g)) / 2;
        for (const [j, sl] of red.entries()) await slikaUOkviru(p, sl, x0 + j * (s + g), ys[i] + (37 - s) / 2, s);
      }
    }

    if (t.vrsta === "prvi_glas") {
      // Slovo u krugu gore, ispod mreža 4 ili 5 stupaca (12 → 4 × 3, 13–15 → 5 × 3).
      const r = 15;
      p.page.drawCircle({ x: p.X(L + W / 2), y: p.Y(vrh + r), size: r * MM, color: BIJELO, borderColor: CRNO, borderWidth: 2.5 });
      const pt = t.slovo.length > 1 ? 40 : 50;
      p.tekst(t.slovo, L + W / 2, vrh + r - (pt * 0.62) / MM, pt, { naslov: true });
      const stupaca = t.slike.length > 12 ? 5 : 4, redova = Math.ceil(t.slike.length / stupaca);
      const g = 6, y0 = vrh + 2 * r + 10;
      const s = Math.min((W - (stupaca - 1) * g) / stupaca, (dno - y0 - (redova - 1) * g) / redova, 38);
      const x0 = L + (W - (stupaca * s + (stupaca - 1) * g)) / 2;
      for (const [i, sl] of t.slike.entries())
        await slikaUOkviru(p, sl, x0 + (i % stupaca) * (s + g), y0 + Math.floor(i / stupaca) * (s + g), s);
    }

    if (t.vrsta === "povezivanje") {
      const n = Math.max(t.lijevo.length, t.desno.length, 1);
      const nat = natpisa([...t.lijevo, ...t.desno]);
      const s = Math.min(40, (H - 6 * (n - 1)) / n - nat);
      const ys = raspodijeli(n, s + nat, 25);
      const xl = L + 8, xd = D - 8 - s;
      for (const [i, sl] of t.lijevo.entries()) { await slikaUOkviru(p, sl, xl, ys[i], s); p.tocka(xl + s + 6, ys[i] + s / 2, 2); }
      for (const [i, sl] of t.desno.entries()) { await slikaUOkviru(p, sl, xd, ys[i], s); p.tocka(xd - 6, ys[i] + s / 2, 2); }
    }

    if (t.vrsta === "scena") {
      // Pozadina gore preko cijele širine, slike ispod u redovima po 5 (dijete zaokružuje).
      const poRedu = Math.min(5, Math.max(1, t.gumbi.length));
      const redova = Math.ceil(t.gumbi.length / poRedu);
      const g = 5, s5 = Math.min(32, (W - (poRedu - 1) * g) / poRedu);
      const nat = natpisa(t.gumbi);
      const visinaGumba = redova * (s5 + nat) + Math.max(0, redova - 1) * g;
      const hp = Math.max(60, H - visinaGumba - 8);
      const img = await ugradi(t.pozadina);
      if (img) {
        const k = Math.min(W / img.width, hp / img.height);
        const iw = img.width * k, ih = img.height * k;
        p.okvir(L + (W - iw) / 2, vrh, iw, ih, 3, 1.5);   // okvir puni bijelo, pa slika preko
        p.slika(img, L + (W - iw) / 2, vrh, iw, ih);
      } else p.okvir(L, vrh, W, hp, 3, 1.5);
      const y0 = vrh + (img ? Math.min(hp, (img.height * Math.min(W / img.width, hp / img.height))) : hp) + 8;
      for (const [i, sl] of t.gumbi.entries()) {
        const red = Math.floor(i / poRedu), u = Math.min(poRedu, t.gumbi.length - red * poRedu);
        const x0 = L + (W - (u * s5 + (u - 1) * g)) / 2;
        await slikaUOkviru(p, sl, x0 + (i % poRedu) * (s5 + g), y0 + red * (s5 + nat + g), s5);
      }
    }

    if (t.vrsta === "listic") {
      // 3 stupca × 4 retka; tekst ispod slike.
      const g = 7, sirinaStupca = (W - 2 * g) / 3;
      const visinaReda = (H - 3 * g) / 4;
      const s = Math.min(sirinaStupca, visinaReda - 9);
      for (const [i, k] of t.kartice.entries()) {
        const x = L + (i % 3) * (sirinaStupca + g), y = vrh + Math.floor(i / 3) * (visinaReda + g);
        if (k.slika) await slikaUOkviru(p, k.slika, x + (sirinaStupca - s) / 2, y, s);
        if (k.tekst) p.tekst(k.tekst, x + sirinaStupca / 2, y + (k.slika ? s + 2 : s / 2), 12, { sirina: sirinaStupca });
      }
    }
  }

  return pdf.save();
}
