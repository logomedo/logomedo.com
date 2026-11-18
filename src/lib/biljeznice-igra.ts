// Igra javne bilježnice (/b/<slug>): ekran po ekran, svaki točno riješen pali lampicu na
// boru, na kraju se bor vrti. Govor: samo odobrena snimka izgovora (ElevenLabs, docs/zvukovi.md);
// bez nje nema zvuka ni zvučnika, tekst se samo čita. Zvonce i efekti iz WebAudija.
// Ništa se ne sprema i ništa ne odlazi na server.
import { ekrani, uputaZa, type Ekran, type ZadatakZaIgru } from "./biljeznice-ekrani.ts";
import { scena, type Orijentacija, type PozadinaPrikaz } from "./scena-prikaz.ts";
import { izmjenaCss, UPUTE_POZICIJE, UPUTE_PRVOG_GLASA, BOJE_DULJINE, jeDuga, type Polje } from "./zadaci/vrste.ts";
import { iskocenoSlovo, koloSlova, znackaSlova } from "./kolo-slova.ts";
import { kljucZvuka } from "./zvukovi-tekst.ts";
import { mapaRijeci } from "./zadaci/napisano.ts";
import { spremnikSvg } from "./spremnici.ts";
import { BOJE_SLOVA, kljucGlasa, POZICIJE, prikazSlova, razbaci, type Pozicija } from "./zadaci/slusanje.ts";

interface Podaci {
  naslov: string; podnaslov: string | null;
  /** Poruka kad nema nijednog ekrana (admin pregled listića). */
  prazno?: string;
  zadaci: ZadatakZaIgru[];
  rijeci: { id: number; rijec: string; slika: string | null; znak?: boolean }[];
  pozadine?: PozadinaPrikaz[];
  /** Rečenica na kraju (iz teme). */
  kraj?: string;
  /** Odobrene snimke: { kljucZvuka(tekst): URL }. */
  zvukovi?: Record<string, string>;
}

type Dijete = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, a: Record<string, unknown> = {}, ...djeca: Dijete[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(a)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") e.className = String(v);
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  (e as any).append(...djeca.filter((x) => x !== null && x !== undefined && x !== false));
  return e;
}
const dodaj = (e: unknown, ...d: Dijete[]) => (e as any).append(...d.filter((x) => x !== null && x !== undefined && x !== false));
const zamijeni = (e: unknown, ...d: Dijete[]) => (e as any).replaceChildren(...d.filter((x) => x !== null && x !== undefined && x !== false));
const VELIKO = (s: string) => s.toLocaleUpperCase("hr");
const SVG = "http://www.w3.org/2000/svg";
// Bubanj s palicama (analiza slogova); palice se pri udarcu zakrenu (.udarac).
const IKONA_BUBANJ = `<svg viewBox="0 0 120 100" aria-hidden="true">
  <g class="palica l"><line x1="18" y1="6" x2="52" y2="34" stroke="#8a5a2b" stroke-width="6" stroke-linecap="round"/><circle cx="52" cy="34" r="6" fill="#f2c27a"/></g>
  <g class="palica d"><line x1="102" y1="6" x2="68" y2="34" stroke="#8a5a2b" stroke-width="6" stroke-linecap="round"/><circle cx="68" cy="34" r="6" fill="#f2c27a"/></g>
  <path d="M14 46v32c0 9 20 16 46 16s46-7 46-16V46" fill="#d9442b" stroke="#5a3414" stroke-width="4"/>
  <path d="M14 52l15 38M37 59l10 33M60 62v32M83 59l-10 33M106 52l-15 38" stroke="#ffd36b" stroke-width="3.5" fill="none"/>
  <ellipse cx="60" cy="46" rx="46" ry="14" fill="#fffdf6" stroke="#5a3414" stroke-width="4"/></svg>`;
const IKONA_ZVUK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>`;

// ---------- Zvuk ----------

let govornik: HTMLElement | null = null;
let snimke: Record<string, string> = {};
// Jedan element za sve snimke: iOS ga otključa jednom, u dodiru „Kreni” (otkljucajSnimke).
const svirac = typeof Audio === "undefined" ? null : new Audio();
function otkljucajSnimke() {
  const prva = Object.values(snimke)[0];
  if (!svirac || !prva) return;
  svirac.muted = true; svirac.src = prva;
  svirac.play().then(() => { svirac.pause(); svirac.muted = false; }, () => { svirac.muted = false; });
}
/** Ima li tekst odobrenu snimku. Bez nje igra šuti (glas preglednika je za hrvatski preloš). */
const imaSnimku = (tekst: string) => !!snimke[kljucZvuka(tekst)];
function govori(tekst: string, gumb?: HTMLElement) {
  niz++;
  govornik?.classList.remove("govori");
  govornik = gumb ?? null;
  const url = snimke[kljucZvuka(tekst)];
  if (!url || !svirac) return;
  svirac.pause(); svirac.muted = false; svirac.src = url; svirac.currentTime = 0;
  gumb?.classList.add("govori");
  const gotovo = () => gumb?.classList.remove("govori");
  svirac.onended = gotovo;
  svirac.onerror = gotovo;
  svirac.play().catch(gotovo);
}

/**
 * Niz snimki jednu za drugom (uputa, glas, riječ). Tekst bez snimke se preskače. Novi `govori`
 * ili `govoriNiz` prekida stari niz (`niz` se mijenja).
 */
let niz = 0;
function govoriNiz(tekstovi: string[], gumb?: HTMLElement) {
  govornik?.classList.remove("govori");
  govornik = gumb ?? null;
  const urls = tekstovi.map((t) => snimke[kljucZvuka(t)]).filter((u): u is string => !!u);
  const moj = ++niz;
  if (!urls.length || !svirac) return;
  gumb?.classList.add("govori");
  const gotovo = () => { if (moj === niz) gumb?.classList.remove("govori"); };
  const sljedeca = (i: number) => {
    if (moj !== niz) return;
    if (i >= urls.length) return gotovo();
    svirac.pause(); svirac.muted = false; svirac.src = urls[i]; svirac.currentTime = 0;
    svirac.onended = () => setTimeout(() => sljedeca(i + 1), 250);
    svirac.onerror = () => sljedeca(i + 1);
    svirac.play().catch(gotovo);
  };
  sljedeca(0);
}

let ac: AudioContext | null = null;
function ton(f: number, kad: number, trajanje: number, jacina = 0.18, oblik: OscillatorType = "sine") {
  if (!ac) return;
  const t = ac.currentTime + kad;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = oblik; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(jacina, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + trajanje);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + trajanje + 0.05);
}
/** Zvonce: tri visoka tona s prizvukom. */
const zvonce = () => [1318.5, 1568, 2093].forEach((f, i) => { ton(f, i * 0.09, 1.1); ton(f * 2.76, i * 0.09, 0.4, 0.04); });
const mekiPogodak = () => { ton(1046.5, 0, 0.5, 0.12); ton(1568, 0.07, 0.6, 0.1); };
const krivo = () => { ton(220, 0, 0.22, 0.12, "triangle"); ton(185, 0.12, 0.3, 0.1, "triangle"); };
/** Tik pregrade kola: kratak, tih klik. */
const tik = () => ton(1900, 0, 0.03, 0.05, "square");
const fanfara = () => [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => { ton(f, i * 0.12, 1.4, 0.13); ton(f * 2, i * 0.12, 0.5, 0.03); });

// ---------- Igra ----------

export function pokreni(korijen: HTMLElement, p: Podaci) {
  // Uz svaku riječ i napisana inačica (-id): polje u kojem dijete čita riječ umjesto slike.
  const rijeci = mapaRijeci(p.rijeci);
  snimke = p.zvukovi ?? {};
  const sviEkrani = ekrani(p.zadaci);
  const lampice = Array.from(document.querySelectorAll<SVGGElement>(".lampica"));
  const brojac = document.getElementById("brojac");
  let trenutni = 0;
  let zakljucano = false;


  /** Zvučnik samo za tekst s odobrenom snimkom; inače null (ništa se ne prikazuje). */
  const zvucnik = (tekst: () => string) => {
    if (!imaSnimku(tekst())) return null;
    const b = h("button", { type: "button", class: "zvucnik", "aria-label": "Poslušaj" });
    b.innerHTML = IKONA_ZVUK;
    b.addEventListener("click", (e) => { e.stopPropagation(); govori(tekst(), b); });
    return b;
  };
  const ime = (id: number | null) => (id === null ? "" : rijeci.get(id)?.rijec ?? "");

  // Znak i napisana riječ nemaju zvučnik: dijete ih čita samo.
  const jeZnak = (id: number | null) => id !== null && !!(rijeci.get(id)?.znak || rijeci.get(id)?.napisano);
  function slika(id: number | null) {
    const r = id === null ? null : rijeci.get(id);
    // Znak (slovo, brojka) se crta kao znak; izmjena percepcije ide na sam <span>.
    if (r?.napisano) return h("div", { class: "slika napisano" }, h("span", { class: "napisano", style: `--n:${[...r.rijec].length}` }, VELIKO(r.rijec)));
    if (r?.znak) return h("div", { class: "slika znak" }, h("span", { class: "znak" }, r.rijec));
    if (r?.slika) return h("div", { class: "slika" }, h("img", { src: r.slika, alt: r.rijec, loading: "eager", draggable: "false" }));
    return h("div", { class: "slika" }, h("span", { class: "bez" }, VELIKO(r?.rijec ?? "?")));
  }

  /** Kartica u drvenom okviru: riječ + zvučnik gore, slika ispod. Klikabilna osim zadane. */
  function kartica(id: number | null, naKlik?: (k: HTMLElement) => void, kl = "") {
    const bez = !(id !== null && rijeci.get(id)?.slika);
    const k = h("div", { class: `kartica ${bez ? "bez-slike " : ""}${kl}`.trim() },
      h("div", { class: "unutra" },
        h("div", { class: "glava" }, h("span", { class: "rijec" }, VELIKO(ime(id))), jeZnak(id) ? null : zvucnik(() => ime(id))),
        slika(id)));
    if (naKlik) {
      k.setAttribute("role", "button"); k.tabIndex = 0;
      k.setAttribute("aria-label", ime(id));
      k.addEventListener("click", () => { if (!zakljucano) naKlik(k); });
      k.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !zakljucano) { e.preventDefault(); naKlik(k); } });
    }
    return k;
  }
  function zadanaKartica(id: number | null) {
    const bez = !(id !== null && rijeci.get(id)?.slika);
    return h("div", { class: `kartica zadana${bez ? " bez-slike" : ""}` },
      h("div", { class: "unutra" }, h("span", { class: "rijec" }, VELIKO(ime(id))), slika(id), jeZnak(id) ? null : zvucnik(() => ime(id))));
  }
  const tresi = (k: HTMLElement) => { krivo(); k.classList.remove("krivo"); void k.offsetWidth; k.classList.add("krivo"); };

  function osvjeziBrojac() {
    const n = lampice.filter((l) => l.classList.contains("upaljena")).length;
    if (brojac) brojac.textContent = sviEkrani.length ? `${n} / ${sviEkrani.length}` : "";
  }
  function upali(i: number) {
    const l = lampice[i];
    if (!l) return;
    l.classList.add("upaljena", "nova");
    setTimeout(() => l.classList.remove("nova"), 800);
    osvjeziBrojac();
  }

  /** Ekran riješen: zvonce, lampica, pa sljedeći. */
  function rijeseno() {
    zakljucano = true;
    korijen.classList.add("zakljucano");
    zvonce();
    upali(trenutni);
    setTimeout(() => { trenutni++; prikazi(); }, 1600);
  }

  function pitanje(tekst: string) {
    const b = zvucnik(() => tekst);
    return { el: h("div", { class: "pitanje" }, h("span", {}, tekst), b), gumb: b ?? undefined };
  }

  function ekranOdabir(e: Extract<Ekran, { vrsta: "odabir" }>) {
    const tekst = uputaZa(e.uputa, ime(e.stavka.zadana));
    const q = pitanje(tekst);
    const red = h("div", { class: "red" }, ...e.stavka.ponudeno.map((id, j) =>
      kartica(id, (k) => { if (j === e.stavka.tocno) { k.classList.add("tocno"); rijeseno(); } else tresi(k); })));
    return { cvorovi: [q.el, zadanaKartica(e.stavka.zadana), red], tekst, gumb: q.gumb };
  }

  function ekranUljez(e: Extract<Ekran, { vrsta: "uljez" }>) {
    const tekst = uputaZa(e.uputa, null);
    const q = pitanje(tekst);
    const red = h("div", { class: "red cetiri" }, ...e.stavka.slike.map((id, j) =>
      kartica(id, (k) => {
        if (j !== e.stavka.uljez) { tresi(k); return; }
        k.classList.add("uljez");
        red.querySelectorAll(".kartica").forEach((x, i) => { if (i !== j) x.classList.add("tocno"); });
        rijeseno();
      })));
    return { cvorovi: [q.el, red], tekst, gumb: q.gumb };
  }

  /** Percepcija: kartica bez riječi i zvučnika (zadatak je vidni), slika s izmjenom. */
  function karticaPolja(p: Polje, naKlik: (k: HTMLElement) => void) {
    const sl = slika(p.rijec_id);
    const css = izmjenaCss(p.izmjena);
    if (css) sl.firstElementChild?.setAttribute("style", css);
    const k = h("div", { class: "kartica bez-glave", role: "button", tabindex: "0", "aria-label": "slika" }, h("div", { class: "unutra" }, sl));
    k.addEventListener("click", () => { if (!zakljucano) naKlik(k); });
    k.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !zakljucano) { e.preventDefault(); naKlik(k); } });
    return k;
  }

  function ekranPercepcija(e: Extract<Ekran, { vrsta: "percepcija" }>) {
    const tekst = uputaZa(e.uputa, null);
    const q = pitanje(tekst);
    const nadjena = new Set<number>();
    const red = h("div", { class: `red percepcija n${e.stavka.polja.length}` }, ...e.stavka.polja.map((p, j) =>
      karticaPolja(p, (k) => {
        if (nadjena.has(j)) return;
        if (!e.stavka.tocno.includes(j)) { tresi(k); return; }
        nadjena.add(j);
        k.classList.add(e.trazi === "razlicitu" ? "uljez" : "tocno");
        if (e.stavka.tocno.every((t) => nadjena.has(t))) rijeseno(); else mekiPogodak();
      })));
    return { cvorovi: [q.el, red], tekst, gumb: q.gumb };
  }

  /**
   * Prvi glas: kolo se zavrti na dodir i stane na slovo kruga, slovo iskoči i izgovori se,
   * pa ispod pitanja dolazi mreža slika. Kartice nemaju riječ (odala bi glas), ali imaju zvučnik.
   */
  function ekranPrviGlas(e: Extract<Ekran, { vrsta: "prvi_glas" }>) {
    const slovo = e.krug.slovo!;
    const trazi = e.uputa.replaceAll("{slovo}", slovo);
    const q = pitanje(UPUTE_PRVOG_GLASA.kolo);
    const okvir = h("div", { class: "kolo-okvir" });
    const kolo = koloSlova({
      slova: e.kolo, boje: e.boje, cilj: slovo, naTik: tik,
      naPocetak: () => q.el.classList.add("skriveno"),
      naKraj: () => {
        zakljucano = true;
        dodaj(kolo.el, iskocenoSlovo(slovo));
        mekiPogodak();
        govori(`Glas ${slovo}!`);
        setTimeout(trazenje, 1900);
      },
    });
    kolo.el.setAttribute("role", "button"); kolo.el.tabIndex = 0; kolo.el.setAttribute("aria-label", "Zavrti kolo");
    dodaj(okvir, kolo.el);

    function trazenje() {
      zakljucano = false;
      const tekstPitanja = trazi.replace(new RegExp(`\\s*${slovo}\\.?$`), "");
      const p2 = h("div", { class: "pitanje" }, h("span", {}, tekstPitanja, " ", znackaSlova(slovo)), zvucnik(() => trazi));
      const nadjene = new Set<number>();
      const slike = e.krug.slike.flatMap((id, j) => (id === null ? [] : [{ id, j }]));
      const mreza = h("div", { class: `red prvi-glas n${slike.length > 12 ? 5 : 4}` }, ...slike.map(({ id, j }) => {
        const k = h("div", { class: "kartica bez-rijeci", role: "button", tabindex: "0", "aria-label": "slika" },
          h("div", { class: "unutra" }, h("div", { class: "glava" }, jeZnak(id) ? null : zvucnik(() => ime(id))), slika(id)));
        const klik = () => {
          if (zakljucano || nadjene.has(j)) return;
          if (!e.krug.tocno.includes(j)) { tresi(k); return; }
          nadjene.add(j);
          k.classList.add("tocno");
          if (e.krug.tocno.every((t) => nadjene.has(t))) rijeseno(); else mekiPogodak();
        };
        k.addEventListener("click", klik);
        k.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); klik(); } });
        return k;
      }));
      zamijeni(korijen, p2, mreza);
      govori(trazi, p2.querySelector<HTMLElement>(".zvucnik") ?? undefined);
    }
    return { cvorovi: [q.el, okvir], tekst: UPUTE_PRVOG_GLASA.kolo, gumb: q.gumb };
  }

  /** Kartica bez napisane riječi (odala bi duljinu), sa zvučnikom u kutu. */
  function karticaBezRijeci(id: number, naKlik?: (k: HTMLElement) => void, kl = "") {
    const k = h("div", { class: `kartica bez-rijeci ${kl}`.trim() },
      h("div", { class: "unutra" }, h("div", { class: "glava" }, zvucnik(() => ime(id))), slika(id)));
    if (naKlik) {
      k.setAttribute("role", "button"); k.tabIndex = 0; k.setAttribute("aria-label", "slika");
      k.addEventListener("click", () => { if (!zakljucano) naKlik(k); });
      k.addEventListener("keydown", (ev) => { if ((ev.key === "Enter" || ev.key === " ") && !zakljucano) { ev.preventDefault(); naKlik(k); } });
    }
    return k;
  }

  /**
   * Slogovi. Duljina: dijete uzme bojicu (crvena = dugačka, plava = kratka) i dodirne sliku.
   * Analiza: velika slika, ispod krugovi; udarac u bubanj oboji sljedeći krug, dodir kruga oboji
   * krugove do njega (ispravak), „Gotovo” provjeri.
   */
  function ekranSlogovi(e: Extract<Ekran, { vrsta: "slogovi" }>) {
    const q = pitanje(e.uputa);
    if (e.nacin === "duljina") {
      let bojica: "duga" | "kratka" | null = null;
      const bojice = (["duga", "kratka"] as const).map((k) => {
        const b = h("button", { type: "button", class: `bojica ${k}`, style: `--b:${BOJE_DULJINE[k].boja}`, "aria-label": `${BOJE_DULJINE[k].naziv} riječ` },
          h("i", { class: "vrh" }), h("i", { class: "crta" }), h("span", {}, BOJE_DULJINE[k].naziv));
        b.addEventListener("click", () => { bojica = k; bojice.forEach((x) => x.classList.toggle("on", x === b)); govori(`${BOJE_DULJINE[k].naziv} riječ`, undefined); });
        return b;
      });
      const gotove = new Set<number>();
      const red = h("div", { class: `red slogovi-duljina n${e.slike.length}` }, ...e.slike.map((x, j) => karticaBezRijeci(x.rijec_id!, (k) => {
        if (gotove.has(j)) return;
        if (!bojica) { bojice.forEach(tresi); return; }
        if ((bojica === "duga") !== jeDuga(x.slogova)) { tresi(k); return; }
        gotove.add(j);
        k.classList.add("obojena"); k.style.setProperty("--b", BOJE_DULJINE[bojica].boja);
        if (gotove.size === e.slike.length) rijeseno(); else mekiPogodak();
      })));
      return { cvorovi: [q.el, h("div", { class: "bojice" }, ...bojice), red], tekst: e.uputa, gumb: q.gumb };
    }
    const x = e.slike[0];
    let obojeno = 0;
    const krugovi = Array.from({ length: e.krugova }, (_, i) => {
      const c = h("button", { type: "button", class: "slog-krug", "aria-label": `${i + 1}` });
      c.addEventListener("click", () => { if (zakljucano) return; obojeno = obojeno === i + 1 ? i : i + 1; krugovi.forEach((y, j) => y.classList.toggle("on", j < obojeno)); ton(880 + i * 110, 0, 0.12, 0.08); });
      return c;
    });
    const kart = karticaBezRijeci(x.rijec_id!, undefined, "slog-slika");
    // Bubanj: svaki udarac oboji sljedeći krug, slika poskoči (dijete lupa slogove).
    const bubanj = h("button", { type: "button", class: "bubanj", "aria-label": "bubanj" });
    bubanj.innerHTML = IKONA_BUBANJ;
    bubanj.addEventListener("click", () => {
      if (zakljucano) return;
      for (const el of [bubanj, kart]) { el.classList.remove("udarac"); void el.offsetWidth; el.classList.add("udarac"); }
      ton(95, 0, 0.22, 0.4, "sine"); ton(190, 0, 0.08, 0.12, "triangle");
      if (obojeno < e.krugova) { obojeno++; krugovi.forEach((y, j) => y.classList.toggle("on", j < obojeno)); }
    });
    const gotovo = h("button", { type: "button", class: "gumb-gotovo" }, "Gotovo");
    gotovo.addEventListener("click", () => {
      if (zakljucano) return;
      if (obojeno === x.slogova) { kart.classList.add("tocno"); rijeseno(); } else tresi(kart);
    });
    return { cvorovi: [q.el, h("div", { class: "slog-analiza" }, kart, h("div", { class: "slog-krugovi", style: `--n:${e.krugova}` }, ...krugovi), h("div", { class: "slog-dolje" }, bubanj, gotovo))], tekst: e.uputa, gumb: q.gumb };
  }

  function ekranPovezi(e: Extract<Ekran, { vrsta: "povezivanje" }>) {
    const tekst = uputaZa(e.uputa, null);
    const q = pitanje(tekst);
    const s = e.s;
    const spojevi: { l: number; d: number }[] = [];
    let odabran: number | null = null;
    const svg = document.createElementNS(SVG, "svg");
    svg.classList.add("crte");
    // Broj parova određuje veličinu kartica (CSS --n), da i 6–8 parova stane u visinu ekrana.
    const platno = h("div", { class: "povezi", style: `--n:${Math.max(4, s.parovi.length)}` });

    const lijevi: HTMLElement[] = s.parovi.map((par, i) => kartica(par.lijevo, () => {
      if (spojevi.some((x) => x.l === i)) return;
      odabran = odabran === i ? null : i;
      lijevi.forEach((x, j) => x.classList.toggle("odabrana", j === odabran));
      if (odabran !== null) govori(ime(par.lijevo));
    }));
    const desni: HTMLElement[] = s.desno_redoslijed.map((pi, k) => kartica(s.parovi[pi].desno, (el) => {
      if (spojevi.some((x) => x.d === k)) return;
      if (odabran === null) { govori(ime(s.parovi[pi].desno)); return; }
      if (pi !== odabran) { tresi(el); return; }
      spojevi.push({ l: odabran, d: k });
      lijevi[odabran].classList.remove("odabrana");
      lijevi[odabran].classList.add("tocno", "spojena"); el.classList.add("tocno", "spojena");
      odabran = null;
      crtaj();
      if (spojevi.length === s.parovi.length) rijeseno(); else mekiPogodak();
    }));
    dodaj(platno, svg, h("div", { class: "stupac" }, ...lijevi), h("div", { class: "stupac" }, ...desni));

    function crtaj() {
      const o = platno.getBoundingClientRect();
      const tocka = (el: HTMLElement, desno: boolean) => { const r = el.getBoundingClientRect(); return [desno ? r.right - o.x : r.left - o.x, r.top + r.height / 2 - o.y]; };
      zamijeni(svg, ...spojevi.map(({ l, d }) => {
        const [x1, y1] = tocka(lijevi[l], true), [x2, y2] = tocka(desni[d], false);
        const c = document.createElementNS(SVG, "line");
        c.setAttribute("x1", String(x1)); c.setAttribute("y1", String(y1)); c.setAttribute("x2", String(x2)); c.setAttribute("y2", String(y2));
        return c;
      }));
    }
    new ResizeObserver(crtaj).observe(platno);
    return { cvorovi: [q.el, platno], tekst, gumb: q.gumb };
  }

  /**
   * Razvrstavanje: slike gore, spremnici (vreće, košare, kutije) s oznakom dolje. Dijete sliku povuče prstom
   * u spremnik, ili dodirne sliku pa spremnik. Prava uleti u spremnik (broj na njemu raste), kriva se vrati
   * na mjesto. Dodir slike izgovori riječ. Kad su sve razvrstane, ekran je riješen.
   */
  function ekranRazvrstavanje(e: Extract<Ekran, { vrsta: "razvrstavanje" }>) {
    const tekst = uputaZa(e.uputa, null);
    const q = pitanje(tekst);
    const s = e.s;
    const slike = s.slike.filter((x) => x.rijec_id !== null);
    let ostalo = slike.length;
    let odabrana: number | null = null;
    const spremnici = s.kategorije.map((oznaka, j) => {
      const b = h("button", { type: "button", class: "spremnik", "aria-label": oznaka ?? "" });
      b.innerHTML = spremnikSvg(s.tema, oznaka);
      const broj = h("span", { class: "spremnik-broj" });
      dodaj(b, broj);
      b.addEventListener("click", () => { if (!zakljucano && odabrana !== null) stavi(odabrana, j); });
      return { b, broj, n: 0 };
    });
    const vrati = (k: HTMLElement) => {
      k.style.transition = "translate .3s ease-out"; k.style.translate = "";
      setTimeout(() => { k.style.transition = ""; }, 320);
    };
    function stavi(i: number, j: number) {
      const k = kartice[i], x = slike[i];
      odabrana = null; kartice.forEach((c) => c.classList.remove("odabrana"));
      if (x.kategorija !== j) { vrati(k); tresi(k); return; }
      // Uleti u spremnik: pomak do njegova središta, smanjenje, nestane (mjesto ostaje, mreža ne skače).
      const a = k.getBoundingClientRect(), c = spremnici[j].b.getBoundingClientRect();
      const [dx, dy] = (k.style.translate || "0px 0px").split(" ").map((v) => parseFloat(v) || 0);
      k.classList.add("spremljena");
      k.style.transition = "translate .35s ease-in, scale .35s ease-in, opacity .35s ease-in";
      k.style.translate = `${dx + c.left + c.width / 2 - (a.left + a.width / 2)}px ${dy + c.top + c.height / 2 - (a.top + a.height / 2)}px`;
      k.style.scale = ".15"; k.style.opacity = "0";
      const sp = spremnici[j];
      sp.n++;
      setTimeout(() => { sp.broj.textContent = String(sp.n); sp.b.classList.remove("poskok"); void sp.b.offsetWidth; sp.b.classList.add("poskok"); }, 300);
      if (--ostalo === 0) setTimeout(rijeseno, 400); else mekiPogodak();
    }
    const kartice = slike.map((x, i) => {
      const k = karticaBezRijeci(x.rijec_id!, undefined, "razvrstaj-kartica");
      // Povlačenje: pomak preko 8 px je vučenje, inače dodir (odabir + izgovor).
      let start: { x: number; y: number; id: number } | null = null, vuce = false;
      const ispod = (cx: number, cy: number) => spremnici.findIndex(({ b }) => { const r = b.getBoundingClientRect(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; });
      k.addEventListener("pointerdown", (ev) => {
        if (zakljucano || k.classList.contains("spremljena") || (ev.target as Element).closest(".zvucnik")) return;
        start = { x: ev.clientX, y: ev.clientY, id: ev.pointerId }; vuce = false;
        k.setPointerCapture(ev.pointerId);
      });
      k.addEventListener("pointermove", (ev) => {
        if (!start || ev.pointerId !== start.id) return;
        const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
        if (!vuce && Math.hypot(dx, dy) < 8) return;
        if (!vuce) { vuce = true; k.classList.add("vuce"); odabrana = null; kartice.forEach((c) => c.classList.remove("odabrana")); }
        k.style.translate = `${dx}px ${dy}px`;
        const j = ispod(ev.clientX, ev.clientY);
        spremnici.forEach((sp, m) => sp.b.classList.toggle("cilj", m === j));
      });
      const pusti = (ev: PointerEvent) => {
        if (!start || ev.pointerId !== start.id) return;
        start = null;
        spremnici.forEach((sp) => sp.b.classList.remove("cilj"));
        if (!vuce) {
          // Dodir: odabir (pa dodir spremnika) i izgovor riječi.
          odabrana = odabrana === i ? null : i;
          kartice.forEach((c, m) => c.classList.toggle("odabrana", m === odabrana));
          if (odabrana !== null) govori(ime(x.rijec_id));
          return;
        }
        k.classList.remove("vuce");
        const j = ev.type === "pointerup" ? ispod(ev.clientX, ev.clientY) : -1;
        if (j < 0 || zakljucano) vrati(k); else stavi(i, j);
      };
      k.addEventListener("pointerup", pusti);
      k.addEventListener("pointercancel", pusti);
      return k;
    });
    const mreza = h("div", { class: `razvrstaj-slike${slike.length > 8 ? " puno" : slike.length > 4 ? " srednje" : ""}` }, ...kartice);
    return { cvorovi: [q.el, mreza, h("div", { class: "spremnici" }, ...spremnici.map((x) => x.b))], tekst, gumb: q.gumb };
  }

  /** Gumb koji izgovori niz (uputa, glas…); null ako nijedan tekst nema snimku. */
  function zvucnikNiza(tekstovi: () => string[], kl = "zvucnik") {
    if (!tekstovi().some(imaSnimku)) return null;
    const b = h("button", { type: "button", class: kl, "aria-label": "Poslušaj" });
    b.innerHTML = IKONA_ZVUK;
    b.addEventListener("click", (e) => { e.stopPropagation(); govoriNiz(tekstovi(), b); });
    return b;
  }

  /**
   * Koje slovo čuješ: pitanje, veliki gumb „čuj glas” i polje s razbacanim slovima (isti raspored kao na
   * papiru za isti ključ). Pravo slovo zasvijetli, krivo se trese i glas se ponovi.
   */
  function ekranKojeSlovo(e: Extract<Ekran, { vrsta: "koje_slovo" }>) {
    const glas = kljucGlasa(e.stavka.glas!);
    const niz = () => [e.uputa, glas];
    const q = h("div", { class: "pitanje" }, h("span", {}, e.uputa), zvucnikNiza(niz));
    const uho = zvucnikNiza(() => [glas], "cuj-glas");
    const omjer = innerWidth > innerHeight ? 1.9 : 0.9;
    const { mjesta, stupaca, redova } = razbaci(e.stavka.ponudeno.length, e.kljuc, omjer);
    const polje = h("div", { class: "slova-polje", style: `--omjer:${omjer};--cel:${Math.min(100 / stupaca, (100 / redova) / omjer)}` },
      ...e.stavka.ponudeno.map((sl, i) => {
        const m = mjesta[i];
        const b = h("button", { type: "button", class: "razbacano", style: `left:${m.x * 100}%;top:${m.y * 100}%;--kut:${m.kut}deg;--boja:${BOJE_SLOVA[m.boja]}`, "aria-label": sl },
          prikazSlova(sl, e.slova));
        b.addEventListener("click", () => {
          if (zakljucano) return;
          if (sl === e.stavka.glas) { b.classList.add("tocno"); rijeseno(); return; }
          b.classList.remove("krivo"); void b.offsetWidth; b.classList.add("krivo"); krivo();
          setTimeout(() => govoriNiz([glas], uho ?? undefined), 500);
        });
        return b;
      }));
    return { cvorovi: [q, uho, polje], niz: niz(), gumb: q.querySelector<HTMLElement>(".zvucnik") ?? undefined };
  }

  /**
   * Gdje je glas: slika (dodir izgovori riječ), ispod tri kruga: početak, sredina, kraj. Pitanje izgovori
   * uputu, glas i riječ. Pravi krug se oboji, krivi se trese.
   */
  function ekranPozicija(e: Extract<Ekran, { vrsta: "pozicija_glasa" }>) {
    const id = e.slika.rijec_id!, glas = kljucGlasa(e.glas);
    const niz = () => [e.uputa, glas, ime(id)];
    const q = h("div", { class: "pitanje" }, (e.uputa === UPUTE_POZICIJE.ekran ? h("span", {}, "Gdje čuješ glas ", znackaSlova(e.glas), "?") : h("span", {}, e.uputa, " ", znackaSlova(e.glas))), zvucnikNiza(niz));
    const uho = zvucnikNiza(() => [glas], "cuj-glas");
    const kart = karticaBezRijeci(id, () => govori(ime(id)), "pozicija-slika");
    const krugovi = ([0, 1, 2] as Pozicija[]).map((p) => {
      const c = h("button", { type: "button", class: "pozicija-krug", "aria-label": POZICIJE[p].naziv });
      c.addEventListener("click", () => {
        if (zakljucano) return;
        if (p === e.slika.pozicija) { c.classList.add("on"); kart.classList.add("tocno"); rijeseno(); return; }
        c.classList.remove("krivo"); void c.offsetWidth; c.classList.add("krivo"); krivo();
      });
      return c;
    });
    return { cvorovi: [q, h("div", { class: "pozicija" }, kart, h("div", { class: "pozicija-krugovi" }, ...krugovi), uho)], niz: niz(), gumb: q.querySelector<HTMLElement>(".zvucnik") ?? undefined };
  }

  /** Scena preko cijelog ekrana; orijentacija prati uređaj, pogođeni gumbi ostaju pri okretanju. */
  let makniScenu: (() => void) | null = null;
  function ekranScena(e: Extract<Ekran, { vrsta: "scena" }>) {
    const tekst = uputaZa(e.uputa, null);
    const pozadina = p.pozadine?.find((x) => x.id === e.s.pozadina_id) ?? null;
    const sloj = h("div", { class: "scena-cijeli" });
    const pogodeni = new Set<number>();
    const orijentacija = (): Orijentacija => (innerHeight > innerWidth ? "uspravno" : "vodoravno");
    let sada = orijentacija();
    const crtaj = () => zamijeni(sloj, scena({
      sadrzaj: e.s, pitanje: tekst, pozadina, rijeci: rijeci as any, orijentacija: sada, pogodeni,
      govori, imaZvuk: imaSnimku, zvuk: { pogodak: mekiPogodak, krivo },
      naKraj: () => { zakljucano = true; sloj.classList.add("odlazi"); setTimeout(rijeseno, 500); },
    }));
    const naPromjenu = () => { if (orijentacija() !== sada) { sada = orijentacija(); crtaj(); } };
    crtaj();
    addEventListener("resize", naPromjenu);
    dodaj(document.body, sloj);
    makniScenu = () => { removeEventListener("resize", naPromjenu); sloj.remove(); makniScenu = null; };
    return { cvorovi: [], tekst, gumb: sloj.querySelector<HTMLElement>(".zvucnik") ?? undefined };
  }

  function prikazi() {
    zakljucano = false;
    korijen.classList.remove("zakljucano");
    makniScenu?.();
    if (trenutni >= sviEkrani.length) return kraj();
    const e = sviEkrani[trenutni];
    if (e.vrsta === "scena") {
      const x = ekranScena(e);
      zamijeni(korijen);
      setTimeout(() => govori(x.tekst, document.querySelector<HTMLElement>(".scena-cijeli .zvucnik") ?? undefined), 350);
      return;
    }
    if (e.vrsta === "koje_slovo" || e.vrsta === "pozicija_glasa") {
      const y = e.vrsta === "koje_slovo" ? ekranKojeSlovo(e) : ekranPozicija(e);
      zamijeni(korijen, ...y.cvorovi);
      setTimeout(() => govoriNiz(y.niz, y.gumb), 350);
      return;
    }
    const x = e.vrsta === "odabir" ? ekranOdabir(e) : e.vrsta === "uljez" ? ekranUljez(e) : e.vrsta === "percepcija" ? ekranPercepcija(e)
      : e.vrsta === "prvi_glas" ? ekranPrviGlas(e) : e.vrsta === "slogovi" ? ekranSlogovi(e) : e.vrsta === "razvrstavanje" ? ekranRazvrstavanje(e)
      : ekranPovezi(e as Extract<Ekran, { vrsta: "povezivanje" }>);
    zamijeni(korijen, ...x.cvorovi);
    setTimeout(() => govori(x.tekst, x.gumb), 350);
  }

  function kraj() {
    document.body.classList.add("kraj");
    fanfara();
    const ponovi = h("button", { type: "button", class: "gumb-ponovi", onclick: () => {
      document.body.classList.remove("kraj");
      lampice.forEach((l) => l.classList.remove("upaljena"));
      trenutni = 0; osvjeziBrojac(); prikazi();
    } }, "Ponovi");
    zamijeni(korijen, h("div", { class: "bravo" }, h("h2", {}, "Bravo!"), ponovi));
    setTimeout(() => govori(p.kraj ?? "Bravo! Sve lampice svijetle."), 600);
  }

  // Uvod: dodir je potreban da preglednik dopusti zvuk.
  const kreni = h("button", { type: "button", class: "gumb-kreni", onclick: () => {
    try { ac = new AudioContext(); } catch { ac = null; }
    otkljucajSnimke();
    prikazi();
  } }, "Kreni");
  const uvod = korijen.querySelector(".uvod");
  if (uvod) dodaj(uvod, sviEkrani.length ? kreni : h("p", {}, p.prazno ?? "Bilježnica još nema zadataka."));
  osvjeziBrojac();
}
