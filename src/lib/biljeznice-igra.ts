// Igra javne bilježnice (/b/<slug>): ekran po ekran, svaki točno riješen pali lampicu na
// boru, na kraju se bor vrti. Zvuk: glas preglednika (hr-HR) i zvonce iz WebAudija.
// Ništa se ne sprema i ništa ne odlazi na server.
import { ekrani, uputaZa, type Ekran, type ZadatakZaIgru } from "./biljeznice-ekrani.ts";
import { scena, type Orijentacija, type PozadinaPrikaz } from "./scena-prikaz.ts";

interface Podaci {
  naslov: string; podnaslov: string | null;
  zadaci: ZadatakZaIgru[];
  rijeci: { id: number; rijec: string; slika: string | null }[];
  pozadine?: PozadinaPrikaz[];
  /** Rečenica na kraju (iz teme). */
  kraj?: string;
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
function govori(tekst: string, gumb?: HTMLElement) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  govornik?.classList.remove("govori");
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
const fanfara = () => [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => { ton(f, i * 0.12, 1.4, 0.13); ton(f * 2, i * 0.12, 0.5, 0.03); });

// ---------- Igra ----------

export function pokreni(korijen: HTMLElement, p: Podaci) {
  const rijeci = new Map(p.rijeci.map((r) => [r.id, r]));
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
    const x = e.vrsta === "odabir" ? ekranOdabir(e) : e.vrsta === "uljez" ? ekranUljez(e) : ekranPovezi(e as Extract<Ekran, { vrsta: "povezivanje" }>);
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
    prikazi();
  } }, "Kreni");
  const uvod = korijen.querySelector(".uvod");
  if (uvod) dodaj(uvod, sviEkrani.length ? kreni : h("p", {}, "Bilježnica još nema zadataka."));
  osvjeziBrojac();
}
