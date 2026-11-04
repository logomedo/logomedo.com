// Prikaz scene (vrsta `scena`): pozadina, pitanje sa zvučnikom na vrhu, traka gumba sa
// slikama uz donji rub. Isti DOM i CSS (scena.css) koriste admin pregled („Dijete rješava”)
// i igra bilježnice, pa je pregled u adminu ono što dijete vidi.
//
// Vodoravno: gumbi u jednom redu. Uspravno: u dva reda. Točan gumb dobije kvačicu i ostaje
// označen, krivi se zatrese; kad su dirnuti svi točni, zove se `naKraj`.

import type { Scena } from "./zadaci/vrste.ts";

export type Orijentacija = "uspravno" | "vodoravno";
export interface SlikaPozadine { url: string; sirina: number; visina: number }
export interface PozadinaPrikaz { id: number; naziv: string; uspravno: SlikaPozadine | null; vodoravno: SlikaPozadine | null }
export interface RijecPrikaz { id: number; rijec: string; slika: string | null }

export interface OpcijeScene {
  sadrzaj: Scena;
  pitanje: string;
  pozadina: PozadinaPrikaz | null;
  rijeci: Map<number, RijecPrikaz>;
  orijentacija: Orijentacija;
  /** Indeksi gumba (u `sadrzaj.gumbi`) koji su već dirnuti točno; dijeli se između crtanja. */
  pogodeni: Set<number>;
  naDodir?: (i: number, tocno: boolean) => void;
  naKraj?: () => void;
  govori?: (tekst: string, gumb?: HTMLElement) => void;
  zvuk?: { pogodak?: () => void; krivo?: () => void };
}

// Tipovi Workera (HTMLRewriter) prepisuju globalni Element, pa append ide kroz ovo.
const dodaj = (e: unknown, ...d: unknown[]) => (e as any).append(...d);
const VELIKO = (s: string) => s.toLocaleUpperCase("hr");
const IKONA_ZVUK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, kl: string, ...djeca: (Node | string | null)[]) {
  const e = document.createElement(tag);
  if (kl) e.className = kl;
  (e as any).append(...djeca.filter((x) => x !== null));
  return e;
}

/** Glas preglednika (hr-HR), kad pozivatelj nema svoj. */
export function govoriPreglednik(tekst: string, gumb?: HTMLElement) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(tekst);
  u.lang = "hr-HR"; u.rate = 0.85;
  const hr = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("hr"));
  const g = hr.find((v) => /lana/i.test(v.name)) ?? hr[0];
  if (g) u.voice = g;
  if (gumb) { gumb.classList.add("govori"); u.onend = u.onerror = () => gumb.classList.remove("govori"); }
  speechSynthesis.speak(u);
}

/** Slika pozadine za orijentaciju: tražena, inače ona koja postoji. */
export function slikaZa(p: PozadinaPrikaz | null, o: Orijentacija): { slika: SlikaPozadine; tocna: boolean } | null {
  if (!p) return null;
  const druga = o === "uspravno" ? p.vodoravno : p.uspravno;
  if (p[o]) return { slika: p[o]!, tocna: true };
  return druga ? { slika: druga, tocna: false } : null;
}

/** Gumbi koji se prikazuju: samo oni sa slikom iz kataloga, s izvornim indeksom. */
export const vidljiviGumbi = (s: Scena) => s.gumbi.map((g, i) => ({ ...g, i })).filter((g) => g.rijec_id !== null);

export function scena(o: OpcijeScene): HTMLElement {
  const govori = o.govori ?? govoriPreglednik;
  const gumbi = vidljiviGumbi(o.sadrzaj);
  const tocnih = gumbi.filter((g) => g.tocno).length;
  const poz = slikaZa(o.pozadina, o.orijentacija);
  const korijen = el("div", `scena ${o.orijentacija}${poz && !poz.tocna ? " druga-orijentacija" : ""}`);
  korijen.style.setProperty("--stupaca", String(Math.max(1, o.orijentacija === "uspravno" && gumbi.length > 4 ? Math.ceil(gumbi.length / 2) : gumbi.length)));

  if (poz) {
    const img = el("img", "scena-pozadina");
    img.src = poz.slika.url; img.alt = o.pozadina!.naziv; img.draggable = false;
    dodaj(korijen, img);
  } else {
    dodaj(korijen, el("div", "scena-pozadina prazna", "Situacija nije odabrana"));
  }

  const zv = el("button", "zvucnik");
  zv.type = "button"; zv.setAttribute("aria-label", "Poslušaj pitanje"); zv.innerHTML = IKONA_ZVUK;
  zv.addEventListener("click", (e) => { e.stopPropagation(); govori(o.pitanje, zv); });
  dodaj(korijen, el("div", "scena-pitanje", el("span", "", o.pitanje || "…"), zv));

  const traka = el("div", "scena-traka");
  let gotovo = tocnih > 0 && gumbi.every((g) => !g.tocno || o.pogodeni.has(g.i));
  for (const g of gumbi) {
    const r = o.rijeci.get(g.rijec_id!);
    const ime = r ? VELIKO(r.rijec) : "?";
    // Bez slike u katalogu riječ stoji u sredini kartice, bez natpisa ispod.
    const b = el("button", `scena-gumb${r?.slika ? "" : " bez-slike"}${o.pogodeni.has(g.i) ? " pogodak" : ""}${gotovo && !g.tocno ? " ugaseno" : ""}`,
      r?.slika ? el("span", "scena-slika", Object.assign(document.createElement("img"), { src: r.slika, alt: "", draggable: false })) : el("span", "scena-slika", el("span", "scena-bez", ime)),
      r?.slika ? el("span", "scena-rijec", ime) : null);
    b.type = "button"; b.setAttribute("aria-label", ime);
    b.addEventListener("click", () => {
      if (gotovo || o.pogodeni.has(g.i)) { govori(ime); return; }
      o.naDodir?.(g.i, g.tocno);
      if (g.tocno) {
        o.pogodeni.add(g.i);
        b.classList.add("pogodak");
        govori(ime);
        if (gumbi.every((x) => !x.tocno || o.pogodeni.has(x.i))) {
          gotovo = true;
          traka.querySelectorAll(".scena-gumb:not(.pogodak)").forEach((x) => x.classList.add("ugaseno"));
          o.naKraj?.();
        } else o.zvuk?.pogodak?.();
      } else {
        o.zvuk?.krivo?.();
        b.classList.remove("krivo"); void b.offsetWidth; b.classList.add("krivo");
      }
    });
    dodaj(traka, b);
  }
  dodaj(korijen, traka);
  return korijen;
}
