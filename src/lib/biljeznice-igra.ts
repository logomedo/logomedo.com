// Igra javne bilježnice (/b/<slug>): ekran po ekran, svaki točno riješen pali lampicu na
// boru, na kraju se bor vrti. Zvuk: odobrena snimka izgovora (ElevenLabs, docs/zvukovi.md), inače
// glas preglednika (hr-HR), i zvonce iz WebAudija.
// Ništa se ne sprema i ništa ne odlazi na server.
import { ekrani, uputaZa, type Ekran, type ZadatakZaIgru } from "./biljeznice-ekrani.ts";
import { scena, type Orijentacija, type PozadinaPrikaz } from "./scena-prikaz.ts";
import { izmjenaCss, UPUTE_PRVOG_GLASA, BOJE_DULJINE, jeDuga, type Polje } from "./zadaci/vrste.ts";
import { iskocenoSlovo, koloSlova, znackaSlova } from "./kolo-slova.ts";
import { kljucZvuka } from "./zvukovi-tekst.ts";

interface Podaci {
  naslov: string; podnaslov: string | null;
  zadaci: ZadatakZaIgru[];
  rijeci: { id: number; rijec: string; slika: string | null }[];
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
const IKONA_ZVUK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>`;

// ---------- Zvuk ----------

let glas: SpeechSynthesisVoice | null = null;
function nadjiGlas() {
  const svi = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("hr"));
  glas = svi.find((v) => /lana/i.test(v.name)) ?? svi[0] ?? null;
}
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
function govori(tekst: string, gumb?: HTMLElement) {
  govornik?.classList.remove("govori");
  govornik = gumb ?? null;
  const url = snimke[kljucZvuka(tekst)];
  if (url && svirac) {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    svirac.pause(); svirac.muted = false; svirac.src = url; svirac.currentTime = 0;
    gumb?.classList.add("govori");
    const gotovo = () => gumb?.classList.remove("govori");
    // Snimka ne radi (mreža, format, iOS zaključan): jednom glas preglednika. AbortError znači
    // da je sljedeći govori() prekinuo ovaj, pa tada ništa.
    let palo = false;
    const zamjena = () => { gotovo(); if (palo || svirac.src !== url) return; palo = true; govoriPreglednikom(tekst, gumb); };
    svirac.onended = gotovo;
    svirac.onerror = zamjena;
    svirac.play().catch((e: DOMException) => { if (e?.name !== "AbortError") zamjena(); });
    return;
  }
  govoriPreglednikom(tekst, gumb);
}
function govoriPreglednikom(tekst: string, gumb?: HTMLElement) {
  if (!("speechSynthesis" in window)) return;
  svirac?.pause();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(tekst);
  u.lang = "hr-HR"; u.rate = 0.85; u.pitch = 1.05;
  if (glas) u.voice = glas;
  if (gumb) { govornik = gumb; gumb.classList.add("govori"); u.onend = u.onerror = () => gumb.classList.remove("govori"); }
  speechSynthesis.speak(u);
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
  const rijeci = new Map(p.rijeci.map((r) => [r.id, r]));
  snimke = p.zvukovi ?? {};
  const sviEkrani = ekrani(p.zadaci);
  const lampice = Array.from(document.querySelectorAll<SVGGElement>(".lampica"));
  const brojac = document.getElementById("brojac");
  let trenutni = 0;
  let zakljucano = false;

  if ("speechSynthesis" in window) { nadjiGlas(); speechSynthesis.addEventListener?.("voiceschanged", nadjiGlas); }

  const zvucnik = (tekst: () => string) => {
    const b = h("button", { type: "button", class: "zvucnik", "aria-label": "Poslušaj" });
    b.innerHTML = IKONA_ZVUK;
    b.addEventListener("click", (e) => { e.stopPropagation(); govori(tekst(), b); });
    return b;
  };
  const ime = (id: number | null) => (id === null ? "" : rijeci.get(id)?.rijec ?? "");

  function slika(id: number | null) {
    const r = id === null ? null : rijeci.get(id);
    if (r?.slika) return h("div", { class: "slika" }, h("img", { src: r.slika, alt: r.rijec, loading: "eager", draggable: "false" }));
    return h("div", { class: "slika" }, h("span", { class: "bez" }, VELIKO(r?.rijec ?? "?")));
  }

  /** Kartica u drvenom okviru: riječ + zvučnik gore, slika ispod. Klikabilna osim zadane. */
  function kartica(id: number | null, naKlik?: (k: HTMLElement) => void, kl = "") {
    const bez = !(id !== null && rijeci.get(id)?.slika);
    const k = h("div", { class: `kartica ${bez ? "bez-slike " : ""}${kl}`.trim() },
      h("div", { class: "unutra" },
        h("div", { class: "glava" }, h("span", { class: "rijec" }, VELIKO(ime(id))), zvucnik(() => ime(id))),
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
      h("div", { class: "unutra" }, h("span", { class: "rijec" }, VELIKO(ime(id))), slika(id), zvucnik(() => ime(id))));
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
    return { el: h("div", { class: "pitanje" }, h("span", {}, tekst), b), gumb: b };
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
          h("div", { class: "unutra" }, h("div", { class: "glava" }, zvucnik(() => ime(id))), slika(id)));
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
   * Analiza: velika slika, ispod krugovi; dodir kruga oboji krugove do njega, „Gotovo” provjeri.
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
    const gotovo = h("button", { type: "button", class: "gumb-gotovo" }, "Gotovo");
    gotovo.addEventListener("click", () => {
      if (zakljucano) return;
      if (obojeno === x.slogova) { kart.classList.add("tocno"); rijeseno(); } else tresi(kart);
    });
    return { cvorovi: [q.el, h("div", { class: "slog-analiza" }, kart, h("div", { class: "slog-krugovi" }, ...krugovi), gotovo)], tekst: e.uputa, gumb: q.gumb };
  }

  function ekranPovezi(e: Extract<Ekran, { vrsta: "povezivanje" }>) {
    const tekst = uputaZa(e.uputa, null);
    const q = pitanje(tekst);
    const s = e.s;
    const spojevi: { l: number; d: number }[] = [];
    let odabran: number | null = null;
    const svg = document.createElementNS(SVG, "svg");
    svg.classList.add("crte");
    const platno = h("div", { class: "povezi" });

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
      govori, zvuk: { pogodak: mekiPogodak, krivo },
      naKraj: () => { zakljucano = true; sloj.classList.add("odlazi"); setTimeout(rijeseno, 500); },
    }));
    const naPromjenu = () => { if (orijentacija() !== sada) { sada = orijentacija(); crtaj(); } };
    crtaj();
    addEventListener("resize", naPromjenu);
    dodaj(document.body, sloj);
    makniScenu = () => { removeEventListener("resize", naPromjenu); sloj.remove(); makniScenu = null; };
    return { cvorovi: [], tekst, gumb: sloj.querySelector<HTMLElement>(".zvucnik")! };
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
    const x = e.vrsta === "odabir" ? ekranOdabir(e) : e.vrsta === "uljez" ? ekranUljez(e) : e.vrsta === "percepcija" ? ekranPercepcija(e)
      : e.vrsta === "prvi_glas" ? ekranPrviGlas(e) : e.vrsta === "slogovi" ? ekranSlogovi(e)
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
    if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(""));   // iOS: otključa govor u dodiru
    otkljucajSnimke();
    prikazi();
  } }, "Kreni");
  const uvod = korijen.querySelector(".uvod");
  if (uvod) dodaj(uvod, sviEkrani.length ? kreni : h("p", {}, "Bilježnica još nema zadataka."));
  osvjeziBrojac();
}
