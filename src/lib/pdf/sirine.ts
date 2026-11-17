// Širine slova Nunito 900 (naslov) i 800 (tekst) u tisućinkama em-a, izvađene iz public/fonts/nunito-*.ttf
// (fontkit advanceWidth). Model (model.ts) njima prelama zaglavlje kao PDF, bez učitavanja fonta, pa
// pregled Ispisa i PDF lome stranice na istom mjestu. Nepoznat znak broji se kao 1000 (sa strane sigurnosti).

const ZNAKOVI = " abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZčćđšžČĆĐŠŽ0123456789.,:;!?()-–—'\"„“”’/·+=%&*";
const NASLOV = [286,568,620,484,620,555,402,626,606,281,287,580,348,902,606,602,620,620,434,496,426,601,542,868,572,541,487,763,702,688,786,614,579,747,786,312,390,712,585,884,758,807,676,807,706,651,644,748,742,1128,698,645,625,484,484,620,496,487,688,688,786,651,625,600,600,600,600,600,600,600,600,600,600,272,272,272,272,272,478,407,407,445,500,1000,269,515,502,502,502,272,349,272,600,600,964,766,456];
const TEKST = [279,557,610,478,610,549,382,615,595,268,273,558,333,889,595,589,610,610,412,492,404,590,534,861,559,533,480,753,695,684,774,605,570,742,780,297,372,688,573,876,753,796,664,796,696,641,632,743,727,1120,685,631,615,478,478,610,492,480,684,684,774,641,615,600,600,600,600,600,600,600,600,600,600,260,260,260,260,260,468,382,382,440,500,1000,256,481,472,472,472,260,331,260,600,600,954,745,454];
const mapa = (w: number[]) => new Map([...ZNAKOVI].map((z, i) => [z, w[i]]));
const SIRINE = { naslov: mapa(NASLOV), tekst: mapa(TEKST) };

/** Širina teksta u mm (bez kerninga, +1 % zalihe). */
export function sirinaTeksta(t: string, pt: number, naslov = false): number {
  const m = naslov ? SIRINE.naslov : SIRINE.tekst;
  let em = 0;
  for (const z of t) em += m.get(z) ?? 1000;
  return (em / 1000) * pt * 1.01 * 25.4 / 72;
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
