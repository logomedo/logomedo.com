// Editor zadatka u pregledniku: tri pogleda istog sadržaja.
//   Uredi  – slotovi za slike, točan odgovor, upozorenja, spremanje
//   Dijete – interaktivno rješavanje na tabletu/ekranu (pregled; ne sprema se)
//   Ispis  – A4 stranica za papir: „Preuzmi PDF" (pdf-lib u pregledniku) ili window.print
// Sve se crta iz `stanje`; svaka promjena zove `osvjezi()`.

import { brojSlogova, izvediRimu, rimujuSe } from "./rima.ts";
import {
  ocijeni, provjeri, rijeciU, slikaUStilu, slozi, slozRed, tocnaPolja, izmjenaCss, VRSTE, IZMJENE, PONUDENIH, U_REDU, MAX_GUMBA, MAX_REDOVA, POLJA_MIN, POLJA_MAX, UPUTE_PERCEPCIJE,
  BOJE_DULJINE, DUGA_OD, KRUGOVA_MIN, KRUGOVA_MAX, SLOGOVA_MAX, SLOGOVI_SLIKA_MAX, UPUTE_SLOGOVA, jeDuga, slozSlogove, tocnoSlogovi, type NacinSlogova, type Slogovi,
  LISTIC_PO_STRANICI, rasporedListica, type RasporedListica,
  ABECEDA, BOJE_KOLA, SLIKA_MIN, SLIKA_MAX, UPUTE_PRVOG_GLASA, prviGlas, slozKrug, tocneSlike, krugUIgri, type Krug, type PrviGlas,
  type Izmjena, type Listic, type Odabir, type Odgovor, type Percepcija, type Polje, type Povezivanje, type RijecZadatka, type Sadrzaj, type Scena, type Trazi, type Uljez, type Vrsta,
} from "./vrste.ts";
import { iskocenoSlovo, koloSlova, znackaSlova } from "../kolo-slova.ts";
import { scena as scenaPrikaz, slikaZa, vidljiviGumbi, type Orijentacija, type PozadinaPrikaz } from "../scena-prikaz.ts";

export interface Podaci {
  zadatak: { id: number; vrsta: Vrsta; naslov: string; uputa: string | null; podrucje_id: number | null; aktivna_verzija: number; rjesavanja: number; stil: string; sadrzaj: Sadrzaj };

  rijeci: RijecZadatka[];
  podrucja: { id: number; naziv: string }[];
  stilovi: { kod: string; naziv: string }[];
  /** Samo za vrstu `scena`: sve pozadine za izbor. */
  pozadine?: PozadinaPrikaz[];
}

type Dijete = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, a: Record<string, unknown> = {}, ...djeca: Dijete[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(a)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") e.className = String(v);
    else if (k === "style") e.setAttribute("style", String(v));
    else if (k === "value") (e as any).value = String(v);
    else if (k in e && typeof v !== "string") (e as any)[k] = v;
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  dodaj(e, ...djeca);
  return e;
}
// Tipovi Workera (HTMLRewriter) prepisuju globalni Element, pa DOM append/replaceChildren idu kroz ove dvije.
const cisto = (d: Dijete[]) => d.filter((x): x is Node | string => x !== null && x !== undefined && x !== false);
function dodaj(e: unknown, ...d: Dijete[]) { (e as any).append(...cisto(d)); }
function zamijeni(e: unknown, ...d: Dijete[]) { (e as any).replaceChildren(...cisto(d)); }
const VELIKO = (s: string) => s.toLocaleUpperCase("hr");
const SVG = "http://www.w3.org/2000/svg";

export function pokreni(korijen: HTMLElement, p: Podaci) {
  const z = p.zadatak;
  const vrsta = z.vrsta;
  const rijeci = new Map(p.rijeci.map((r) => [r.id, r]));
  let sadrzaj: Sadrzaj = structuredClone(z.sadrzaj);
  let naslov = z.naslov, uputa = z.uputa ?? VRSTE[vrsta].uputa, podrucje = z.podrucje_id, stil = z.stil;
  let pogled: "uredi" | "dijete" | "ispis" = (location.hash.slice(1) as any) || "uredi";
  if (!["uredi", "dijete", "ispis"].includes(pogled)) pogled = "uredi";
  let promijenjeno = false;
  let sRijecima = false;
  const postavke = { stavki: vrsta === "slogovi" ? 8 : vrsta === "listic" ? 12 : 4, maxSlogova: 3, samoSaSlikom: false };

  /** Slike svih riječi u stilu zadatka (riječ bez slike u njemu uzima drugi stil). */
  function postaviStil(kod: string) {
    stil = kod;
    for (const r of p.rijeci) if (r.slike) r.slika = slikaUStilu(r.slike, stil);
  }
  const R = (id: number | null) => (id === null ? null : rijeci.get(id) ?? null);
  const naslovStranice = document.title;
  /** Stanje spremanja vidljivo u svim pogledima (i na Ispisu, gdje se preuzima PDF). */
  function stanjeSpremanja() {
    spremiGumb.classList.toggle("z-nespremljeno", promijenjeno);
    stanjeEl.hidden = !promijenjeno;
    document.title = promijenjeno ? `• ${naslovStranice}` : naslovStranice;
  }
  const oznaci = () => { promijenjeno = true; spremiGumb.disabled = false; spremiGumb.textContent = "Spremi"; stanjeSpremanja(); };

  // ---------- Slike ----------

  /** Slika riječi: prava slika ili riječ kao privremena „slika” dok slike nema. */
  function slika(id: number | null, kl = "", natpis = sRijecima, izmjena: Izmjena = ""): HTMLElement {
    const r = R(id);
    if (!r) return h("div", { class: `z-slika prazna ${kl}` }, h("span", {}, "?"));
    const css = izmjenaCss(izmjena) || undefined;
    return h("div", { class: `z-slika ${kl}` },
      r.slika ? h("img", { src: r.slika, alt: r.rijec, loading: "lazy", draggable: "false", style: css })
        : h("span", { class: "z-bez", style: [r.rijec.length > 7 ? `--m:${Math.max(0.55, 1 - (r.rijec.length - 7) * 0.08)}` : "", css ?? ""].filter(Boolean).join(";") || undefined }, VELIKO(r.rijec)),
      natpis && r.slika ? h("span", { class: "z-natpis" }, VELIKO(r.rijec)) : null,
    );
  }

  // ---------- Odabir riječi (dialog) ----------

  const dlg = h("dialog", { class: "z-birac" });
  dodaj(korijen, dlg);
  function biraj(trenutna: number | null, uzor: number | null, nacin: "rima" | "ne-rima" | null, gotovo: (id: number | null) => void) {
    let filtar: "sve" | "rima" | "ne-rima" = nacin ?? "sve";
    let samoSlika = false;
    const KORAK = 120;
    let koliko = KORAK; // „Učitaj još” povećava; nova pretraga ili filtar vraća na prvih KORAK
    const u = R(uzor);
    const trazi = h("input", { type: "text", placeholder: "Traži riječ ili rimu (npr. -ava)…", autofocus: true });
    const lista = h("div", { class: "z-lista" });
    const filtri = h("div", { class: "z-filtri" });
    const crtaj = () => {
      const q = trazi.value.trim().toLocaleLowerCase("hr");
      const rima = q.startsWith("-") ? VELIKO(q.slice(1)) : null;
      zamijeni(filtri, 
        ...(u ? ([["sve", "Sve"], ["rima", `Rimuje se s ${VELIKO(u.rijec)}`], ["ne-rima", `Ne rimuje se s ${VELIKO(u.rijec)}`]] as const).map(([k, t]) =>
          h("button", { type: "button", class: `z-cip${filtar === k ? " on" : ""}`, onclick: () => { filtar = k; koliko = KORAK; crtaj(); } }, t)) : []),
        h("button", { type: "button", class: `z-cip${samoSlika ? " on" : ""}`, onclick: () => { samoSlika = !samoSlika; koliko = KORAK; crtaj(); } }, "Samo sa slikom"),
      );
      const svi = p.rijeci.filter((r) =>
        (!q || (rima ? r.rima?.endsWith(rima) : r.rijec.toLocaleLowerCase("hr").includes(q))) &&
        (!samoSlika || r.slika) &&
        (!u || filtar === "sve" || (filtar === "rima" ? rimujuSe(u, r) : !rimujuSe(u, r) && r.id !== u.id)));
      const pozicija = lista.scrollTop;
      zamijeni(lista, 
        ...svi.slice(0, koliko).map((r) => h("button", {
          type: "button", class: `z-izbor${r.id === trenutna ? " on" : ""}`,
          onclick: () => { dlg.close(); gotovo(r.id); },
        }, slika(r.id, "mala", false), h("b", {}, VELIKO(r.rijec)), h("small", {}, r.rima ? `-${r.rima.toLocaleLowerCase("hr")}` : "bez rime"))),
        svi.length > koliko ? h("div", { class: "z-jos" },
          h("button", { type: "button", class: "gumb", onclick: () => { koliko += KORAK; crtaj(); } }, `Učitaj još (${Math.min(KORAK, svi.length - koliko)})`),
          h("span", { class: "blijedo" }, `još ${svi.length - koliko} riječi`)) : null,
        !svi.length ? h("p", { class: "blijedo" }, "Nema takvih riječi.") : null,
      );
      lista.scrollTop = pozicija;
      const nova = trazi.value.trim();
      if (nova && !rima && !p.rijeci.some((r) => r.rijec.toLocaleLowerCase("hr") === nova.toLocaleLowerCase("hr"))) {
        dodaj(lista, h("button", { type: "button", class: "gumb mali", onclick: () => dodajRijec(nova) }, `+ Dodaj riječ „${VELIKO(nova)}” u katalog`));
      }
    };
    async function dodajRijec(t: string) {
      const o = await fetch("/admin/api/rijeci", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rijec: t }) });
      const j: any = await o.json();
      if (!o.ok) { alert(j.error ?? "Nije uspjelo"); return; }
      p.rijeci.push(j); p.rijeci.sort((a, b) => a.rijec.localeCompare(b.rijec, "hr")); rijeci.set(j.id, j);
      dlg.close(); gotovo(j.id);
    }
    trazi.oninput = () => { koliko = KORAK; lista.scrollTop = 0; crtaj(); };
    zamijeni(dlg, 
      h("div", { class: "z-birac-vrh" },
        h("b", {}, u ? `Uz ${VELIKO(u.rijec)} (-${(u.rima ?? "?").toLocaleLowerCase("hr")})` : "Odaberi sliku"),
        trenutna !== null ? h("button", { type: "button", class: "gumb mali tihi", onclick: () => { dlg.close(); gotovo(null); } }, "Isprazni") : null,
        h("button", { type: "button", class: "gumb mali tihi", onclick: () => dlg.close() }, "Zatvori")),
      trazi, filtri, lista);
    crtaj();
    dlg.showModal();
  }

  /** Slot u editoru: klik otvara birač. */
  function slot(id: number | null, postavi: (id: number | null) => void, o: { uzor?: number | null; nacin?: "rima" | "ne-rima"; tocno?: boolean; naTocno?: () => void; oznakaTocno?: string } = {}) {
    const r = R(id);
    return h("div", { class: `z-slot${o.tocno ? " tocno" : ""}` },
      h("button", { type: "button", class: "z-slot-slika", title: "Promijeni sliku",
        onclick: () => biraj(id, o.uzor ?? null, o.nacin ?? null, (n) => { postavi(n); oznaci(); osvjezi(); }) },
        r ? slika(id, "", false) : h("div", { class: "z-slika prazna" }, h("span", {}, "+"))),
      h("div", { class: "z-slot-dno" },
        h("span", { class: "z-rijec" }, r ? VELIKO(r.rijec) : "prazno"),
        r?.rima ? h("span", { class: "z-rima" }, `-${r.rima.toLocaleLowerCase("hr")}`) : null),
      o.naTocno ? h("button", { type: "button", class: `z-tocno${o.tocno ? " on" : ""}`, title: o.oznakaTocno, onclick: () => { o.naTocno!(); oznaci(); osvjezi(); } },
        o.tocno ? `✓ ${o.oznakaTocno}` : o.oznakaTocno) : null,
    );
  }

  const redGumbi = (niz: unknown[], i: number) => h("div", { class: "z-red-gumbi" },
    h("button", { type: "button", class: "gumb mali tihi", title: "Gore", disabled: i === 0, onclick: () => { [niz[i - 1], niz[i]] = [niz[i], niz[i - 1]]; oznaci(); osvjezi(); } }, "↑"),
    h("button", { type: "button", class: "gumb mali tihi", title: "Dolje", disabled: i === niz.length - 1, onclick: () => { [niz[i + 1], niz[i]] = [niz[i], niz[i + 1]]; oznaci(); osvjezi(); } }, "↓"),
    h("button", { type: "button", class: "gumb mali tihi opasno", title: "Makni", onclick: () => { niz.splice(i, 1); oznaci(); osvjezi(); } }, "×"));

  // ---------- Pogled: Uredi ----------

  const pozadine = p.pozadine ?? [];
  const pozadina = (id: number | null) => pozadine.find((x) => x.id === id) ?? null;

  function urediScenu(): HTMLElement {
    const s = sadrzaj as Scena;
    const odabrana = pozadina(s.pozadina_id);
    const sliciPozadine = (x: PozadinaPrikaz) => {
      const sl = x.vodoravno ?? x.uspravno;
      return h("button", { type: "button", class: `z-pozadina${x.id === s.pozadina_id ? " on" : ""}`, onclick: () => { s.pozadina_id = x.id; oznaci(); osvjezi(); } },
        sl ? h("img", { src: sl.url, alt: "", loading: "lazy" }) : h("span", { class: "z-bez" }, "bez slike"),
        h("b", {}, x.naziv),
        h("small", {}, [x.uspravno ? "uspravna" : null, x.vodoravno ? "vodoravna" : null].filter(Boolean).join(" + ") || "nema slika"));
    };
    const pomakni = (i: number, d: number) => { const g = s.gumbi; [g[i], g[i + d]] = [g[i + d], g[i]]; oznaci(); osvjezi(); };
    return h("div", { class: "z-uredi" },
      h("div", { class: "ploha z-scena-dio" },
        h("div", { class: "z-dio-glava" }, h("b", {}, "1. Situacija"),
          h("a", { class: "gumb mali tihi", href: "/admin/situacije", target: "_blank" }, "Upravljaj situacijama ↗")),
        pozadine.length
          ? h("div", { class: "z-pozadine" }, ...pozadine.map(sliciPozadine))
          : h("p", { class: "blijedo" }, "Još nema situacija. ", h("a", { href: "/admin/situacije", target: "_blank" }, "Dodaj prvu"), " pa osvježi ovu stranicu."),
        odabrana && (!odabrana.uspravno || !odabrana.vodoravno)
          ? h("p", { class: "sitno z-greska-polja" }, `„${odabrana.naziv}” nema ${odabrana.uspravno ? "vodoravnu" : "uspravnu"} sliku: na takvom ekranu se prikazuje ona koja postoji, s obrubom.`) : null),
      h("div", { class: "ploha z-scena-dio" },
        h("div", { class: "z-dio-glava" }, h("b", {}, "2. Pitanje"), h("span", { class: "sitno blijedo" }, "piše se na vrhu scene i čita naglas")),
        h("input", { type: "text", value: uputa, maxLength: 120, placeholder: "npr. Pečemo kolačiće! Što nam sve treba?", class: uputa.trim() ? "" : "neispravno",
          oninput: (e: Event) => { uputa = (e.target as HTMLInputElement).value; oznaci(); const el = e.target as HTMLInputElement; el.classList.toggle("neispravno", !uputa.trim()); osvjeziPlocu(); } }),
        !uputa.trim() ? h("p", { class: "sitno z-greska-polja" }, "Pitanje je obavezno.") : null),
      h("div", { class: "ploha z-scena-dio" },
        h("div", { class: "z-dio-glava" }, h("b", {}, `3. Slike (${s.gumbi.length}/${MAX_GUMBA})`),
          h("span", { class: "sitno blijedo" }, "označi koje pripadaju situaciji; ostale su ometači")),
        h("div", { class: "z-gumbi-scene" }, ...s.gumbi.map((g, i) => h("div", { class: `z-gumb-scene${g.tocno ? " tocno" : " ometac"}` },
          slot(g.rijec_id, (n) => (g.rijec_id = n)),
          h("div", { class: "z-prekidac" },
            h("button", { type: "button", class: `z-tocno${g.tocno ? " on" : ""}`, onclick: () => { g.tocno = true; oznaci(); osvjezi(); } }, "✓ pripada"),
            h("button", { type: "button", class: `z-tocno ometac${!g.tocno ? " on" : ""}`, onclick: () => { g.tocno = false; oznaci(); osvjezi(); } }, "✗ ometač")),
          h("div", { class: "z-red-gumbi" },
            h("button", { type: "button", class: "gumb mali tihi", title: "Lijevo", disabled: i === 0, onclick: () => pomakni(i, -1) }, "←"),
            h("button", { type: "button", class: "gumb mali tihi", title: "Desno", disabled: i === s.gumbi.length - 1, onclick: () => pomakni(i, 1) }, "→"),
            h("button", { type: "button", class: "gumb mali tihi opasno", title: "Makni", onclick: () => { s.gumbi.splice(i, 1); oznaci(); osvjezi(); } }, "×"))))),
        h("div", { class: "z-gumbi" },
          s.gumbi.length < MAX_GUMBA ? h("button", { type: "button", class: "gumb", onclick: () => { s.gumbi.push({ rijec_id: null, tocno: true }); oznaci(); osvjezi(); } }, "+ Slika koja pripada") : null,
          s.gumbi.length < MAX_GUMBA ? h("button", { type: "button", class: "gumb tihi", onclick: () => { s.gumbi.push({ rijec_id: null, tocno: false }); oznaci(); osvjezi(); } }, "+ Ometač") : null,
          h("button", { type: "button", class: "gumb tihi", onclick: () => { s.gumbi = promijesaj(s.gumbi); oznaci(); osvjezi(); } }, "Promiješaj redoslijed"))),
      h("p", { class: "sitno blijedo" }, "Pregled u kartici „Dijete rješava”, uspravno i vodoravno."));
  }

  function promijesaj<T>(a: T[]): T[] {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  }

  /** Kad sadržaj reda jednoznačno kaže koja su polja točna, oznaka ih prati sama. */
  function uskladi(x: Percepcija["stavke"][0], trazi: Trazi) {
    const t = tocnaPolja(x.polja, trazi);
    const isto = (a: Polje, b: Polje) => a.rijec_id === b.rijec_id && a.izmjena === b.izmjena;
    const ostala = x.polja.filter((_, j) => !t.includes(j));
    const ok = trazi === "razlicitu"
      ? ostala.every((p) => isto(p, ostala[0])) && !isto(x.polja[t[0]], ostala[0])
      : isto(x.polja[t[0]], x.polja[t[1]]) && [x.polja[t[0]], ...ostala].every((p, a, sve) => sve.every((q, b) => a === b || !isto(p, q)));
    if (ok) x.tocno = t;
  }

  function urediPercepciju(): HTMLElement {
    const s = sadrzaj as Percepcija;
    const izmjene = Object.entries(IZMJENE) as [Izmjena, string][];
    const promijeniTrazi = (t: Trazi) => {
      if (t === s.trazi) return;
      if (uputa === UPUTE_PERCEPCIJE[s.trazi].ispis || !uputa.trim()) uputa = UPUTE_PERCEPCIJE[t].ispis;
      s.trazi = t;
      s.stavke = s.stavke.map((x) => slozRed(x.polja.find((p) => p.rijec_id !== null)?.rijec_id ?? null, x.polja.length, t));
      oznaci(); resetRjesavanja(); osvjezi();
    };
    const oznaka = s.trazi === "razlicitu" ? "različita" : "par";
    return h("div", { class: "z-uredi" },
      h("div", { class: "ploha z-scena-dio" },
        h("div", { class: "z-dio-glava" }, h("b", {}, "Što dijete traži")),
        h("div", { class: "z-prekidac" },
          ...([["razlicitu", "Jednu koja je drukčija"], ["par", "Dvije iste"]] as const).map(([k, t]) =>
            h("button", { type: "button", class: `z-tocno${s.trazi === k ? " on" : ""}`, onclick: () => promijeniTrazi(k) }, t))),
        h("p", { class: "sitno blijedo" }, s.trazi === "razlicitu"
          ? "Sve slike u redu su iste osim jedne. Promjena izmjene sama pomiče oznaku."
          : "Sve slike u redu su različite osim dvije. Promjena izmjene sama pomiče oznaku para."),
        h("p", { class: "sitno blijedo" }, "Simetrične slike (lopta, jabuka) zrcaljene izgledaju isto: za njih odaberi okretanje ili boju.")),
      ...s.stavke.map((x, i) => {
        const prva = x.polja.find((p) => p.rijec_id !== null)?.rijec_id ?? null;
        const promjena = () => { uskladi(x, s.trazi); oznaci(); osvjezi(); };
        return h("div", { class: "ploha z-red-uredi z-percepcija-red" },
          h("div", { class: "z-red-broj" }, String(i + 1)),
          h("div", { class: "z-percepcija-polja" }, ...x.polja.map((p, j) => {
            const tocno = x.tocno.includes(j);
            return h("div", { class: `z-slot${tocno ? " tocno" : ""}` },
              h("button", { type: "button", class: "z-slot-slika", title: "Druga slika samo u ovom polju",
                onclick: () => biraj(p.rijec_id, null, null, (n) => { p.rijec_id = n; promjena(); }) },
                p.rijec_id !== null ? slika(p.rijec_id, "", false, p.izmjena) : h("div", { class: "z-slika prazna" }, h("span", {}, "+"))),
              h("select", { class: "z-izmjena", onchange: (e: Event) => { p.izmjena = (e.target as HTMLSelectElement).value as Izmjena; promjena(); } },
                ...izmjene.map(([k, t]) => h("option", { value: k, selected: k === p.izmjena }, t))),
              h("button", { type: "button", class: `z-tocno${tocno ? " on" : ""}`, onclick: () => {
                if (s.trazi === "razlicitu") x.tocno = [j];
                else if (tocno) return;
                else x.tocno = [x.tocno[x.tocno.length - 1], j].sort((a, b) => a - b);
                oznaci(); osvjezi();
              } }, tocno ? `✓ ${oznaka}` : oznaka));
          })),
          h("div", { class: "z-red-gumbi z-percepcija-alati" },
            h("button", { type: "button", class: "gumb mali", title: "Ista slika u svim poljima reda",
              onclick: () => biraj(prva, null, null, (n) => { x.polja.forEach((p) => (p.rijec_id = n)); promjena(); }) }, "Slika reda"),
            h("button", { type: "button", class: "gumb mali tihi", title: "Nove izmjene i redoslijed", onclick: () => { s.stavke[i] = slozRed(prva, x.polja.length, s.trazi); oznaci(); osvjezi(); } }, "Nasumično"),
            h("button", { type: "button", class: "gumb mali tihi", title: "Polje manje", disabled: x.polja.length <= POLJA_MIN, onclick: () => { s.stavke[i] = slozRed(prva, x.polja.length - 1, s.trazi); oznaci(); osvjezi(); } }, "−"),
            h("button", { type: "button", class: "gumb mali tihi", title: "Polje više", disabled: x.polja.length >= POLJA_MAX, onclick: () => { s.stavke[i] = slozRed(prva, x.polja.length + 1, s.trazi); oznaci(); osvjezi(); } }, "+"),
            redGumbi(s.stavke, i)));
      }),
      h("button", { type: "button", class: "gumb", disabled: s.stavke.length >= MAX_REDOVA, title: s.stavke.length >= MAX_REDOVA ? `Najviše ${MAX_REDOVA} redova` : undefined, onclick: () => { s.stavke.push(slozRed(null, s.stavke.at(-1)?.polja.length ?? 4, s.trazi)); oznaci(); osvjezi(); } }, "+ Dodaj red"));
  }

  /** Točne slike kruga uvijek prate riječi i slovo (prvi glas je pravopisan, ne bira se rukom). */
  const uskladiKrug = (k: Krug) => { k.tocno = tocneSlike(k, (id) => R(id)?.rijec); };
  /** Riječi za slaganje kruga: sa slikom ako ih ima dovoljno (zadatak je slikovni). */
  const zaKrug = () => { const sa = p.rijeci.filter((r) => r.slika); return sa.length >= SLIKA_MIN ? sa : p.rijeci; };
  const brojSlova = (sl: string) => zaKrug().filter((r) => prviGlas(r.rijec) === sl).length;

  function urediPrviGlas(): HTMLElement {
    const s = sadrzaj as PrviGlas;
    s.krugovi.forEach(uskladiKrug);
    const naKolu = (sl: string) => s.kolo.includes(sl);
    const slovaKrugova = ABECEDA.filter((sl) => s.krugovi.some((k) => k.slovo === sl));
    const prebaci = (sl: string) => {
      const novo = naKolu(sl) ? s.kolo.filter((x) => x !== sl) : [...s.kolo, sl];
      if (novo.length < 2) return;
      s.kolo = ABECEDA.filter((x) => novo.includes(x));
      // Krug čije slovo nije na kolu ostaje u editoru, ali ga igra i pregled preskaču.
      resetRjesavanja();
      oznaci(); osvjezi();
    };
    const nasumicnoSlovo = () => {
      const moguca = s.kolo.filter((sl) => brojSlova(sl) >= 3);
      const iz = moguca.length ? moguca : s.kolo;
      return iz[Math.floor(Math.random() * iz.length)];
    };
    return h("div", { class: "z-uredi" },
      h("div", { class: "ploha z-scena-dio" },
        h("div", { class: "z-dio-glava" }, h("b", {}, `Slova na kolu (${s.kolo.length}/${ABECEDA.length})`),
          s.kolo.length < ABECEDA.length ? h("button", { type: "button", class: "gumb mali tihi", onclick: () => { s.kolo = [...ABECEDA]; oznaci(); osvjezi(); } }, "Sva slova") : null,
          // Kolo samo sa slovima na koja staje (barem 2, inače se ne bi imalo što vrtjeti).
          slovaKrugova.length >= 2 && slovaKrugova.join() !== s.kolo.join()
            ? h("button", { type: "button", class: "gumb mali tihi", title: "Na kolu ostaju samo slova odabrana u krugovima", onclick: () => { s.kolo = [...slovaKrugova]; oznaci(); resetRjesavanja(); osvjezi(); } }, "Samo slova krugova") : null),
        h("div", { class: "z-kolo-slova" }, ...ABECEDA.map((sl) => h("button", { type: "button", class: `z-cip${naKolu(sl) ? " on" : ""}`, title: `${brojSlova(sl)} riječi u katalogu`, onclick: () => prebaci(sl) }, sl))),
        h("div", { class: "z-dio-glava" }, h("b", {}, "Boje kola")),
        h("div", { class: "z-kolo-boje" }, ...(Object.entries(BOJE_KOLA) as [keyof typeof BOJE_KOLA, (typeof BOJE_KOLA)[keyof typeof BOJE_KOLA]][]).map(([kod, b]) =>
          h("button", { type: "button", class: `z-cip${(s.boje ?? "sareno") === kod ? " on" : ""}`, onclick: () => { s.boje = kod; oznaci(); resetRjesavanja(); osvjezi(); } },
            h("span", { class: "z-kolo-uzorak", style: `background:conic-gradient(${b.polja.flatMap((c, i, a) => [`${c} ${(i / a.length) * 100}%`, `${c} ${((i + 1) / a.length) * 100}%`]).join(",")})` }), b.naziv))),
        h("p", { class: "sitno blijedo" }, "Dodirom na slovo ono se makne s kola ili vrati na njega. Kolo izgleda nasumično, a stane na slovo kruga. Slike koje počinju tim glasom označe se same (LJ, NJ i DŽ su jedan glas: LJULJAČKA ne počinje glasom L).")),
      ...s.krugovi.map((k, i) => {
        const tocnih = k.tocno.length;
        const promijeni = (n: number) => { s.krugovi[i] = slozKrug(k.slovo, zaKrug(), n); oznaci(); resetRjesavanja(); osvjezi(); };
        return h("div", { class: "ploha z-krug" },
          h("div", { class: "z-krug-glava" },
            h("div", { class: "z-red-broj" }, String(i + 1)),
            h("label", { class: "z-krug-slovo" }, "Kolo stane na ",
              h("select", { class: k.slovo && naKolu(k.slovo) ? "" : "neispravno", onchange: (e: Event) => { k.slovo = (e.target as HTMLSelectElement).value || null; uskladiKrug(k); oznaci(); resetRjesavanja(); osvjezi(); } },
                h("option", { value: "" }, "—"),
                // Slovo maknuto s kola ostaje vidljivo, da se zna zašto igra preskače krug.
                k.slovo && !naKolu(k.slovo) ? h("option", { value: k.slovo, selected: true }, `${k.slovo} (nije na kolu)`) : null,
                ...s.kolo.map((sl) => h("option", { value: sl, selected: sl === k.slovo }, sl)))),
            k.slovo && !naKolu(k.slovo) ? h("span", { class: "sitno", style: "color:var(--greska)" }, "Slovo nije na kolu: igra preskače ovaj krug.") : null,
            k.slovo ? h("span", { class: "sitno blijedo" }, `${tocnih} od ${k.slike.filter((x) => x !== null).length} slika počinje glasom ${k.slovo}`) : null,
            h("div", { class: "z-red-gumbi z-percepcija-alati" },
              h("button", { type: "button", class: "gumb mali", disabled: !k.slovo, title: "Nove slike iz kataloga za ovo slovo", onclick: () => promijeni(k.slike.length) }, "Složi slike"),
              h("button", { type: "button", class: "gumb mali tihi", title: "Drugo slovo i nove slike", onclick: () => { s.krugovi[i] = slozKrug(nasumicnoSlovo(), zaKrug(), k.slike.length); oznaci(); resetRjesavanja(); osvjezi(); } }, "Nasumično slovo"),
              h("button", { type: "button", class: "gumb mali tihi", title: "Slika manje", disabled: k.slike.length <= SLIKA_MIN, onclick: () => { k.slike.pop(); uskladiKrug(k); oznaci(); osvjezi(); } }, "−"),
              h("button", { type: "button", class: "gumb mali tihi", title: "Slika više", disabled: k.slike.length >= SLIKA_MAX, onclick: () => { k.slike.push(null); oznaci(); osvjezi(); } }, "+"),
              redGumbi(s.krugovi, i))),
          h("div", { class: "z-krug-slike" }, ...k.slike.map((id, j) => slot(id, (n) => { k.slike[j] = n; uskladiKrug(k); }, { tocno: k.tocno.includes(j) }))),
          h("div", { class: "z-gumbi" },
            h("button", { type: "button", class: "gumb mali tihi", onclick: () => { k.slike = promijesaj(k.slike); uskladiKrug(k); oznaci(); osvjezi(); } }, "Promiješaj redoslijed")));
      }),
      h("button", { type: "button", class: "gumb", disabled: s.krugovi.length >= MAX_REDOVA, onclick: () => { s.krugovi.push(slozKrug(nasumicnoSlovo(), zaKrug())); oznaci(); osvjezi(); } }, "+ Dodaj krug"));
  }

  /** Krugovi slogova (prazni ili obojeni do `obojeno`). */
  const kruzici = (n: number, obojeno = 0, kl = "z-slog-krugovi") => h("div", { class: kl }, ...Array.from({ length: n }, (_, i) => h("i", { class: i < obojeno ? "on" : "" })));
  const oznakaDuljine = (slogova: number) => { const k = jeDuga(slogova) ? "duga" : "kratka"; return h("span", { class: "z-duljina", style: `--b:${BOJE_DULJINE[k].boja}` }, BOJE_DULJINE[k].naziv); };

  function urediSlogove(): HTMLElement {
    const s = sadrzaj as Slogovi;
    const promijeniNacin = (n: NacinSlogova) => {
      if (n === s.nacin) return;
      if (uputa === UPUTE_SLOGOVA[s.nacin].ispis || !uputa.trim()) uputa = UPUTE_SLOGOVA[n].ispis;
      s.nacin = n; oznaci(); resetRjesavanja(); osvjezi();
    };
    return h("div", { class: "z-uredi" },
      h("div", { class: "ploha z-scena-dio" },
        h("div", { class: "z-dio-glava" }, h("b", {}, "Što dijete radi")),
        h("div", { class: "z-prekidac" },
          ...([["duljina", "Dugačke i kratke riječi"], ["analiza", "Slogovna analiza (krugovi)"]] as const).map(([k, t]) =>
            h("button", { type: "button", class: `z-tocno${s.nacin === k ? " on" : ""}`, onclick: () => promijeniNacin(k) }, t))),
        s.nacin === "duljina"
          ? h("p", { class: "sitno blijedo" }, `Dugačka riječ ima ${DUGA_OD} ili više slogova (${BOJE_DULJINE.duga.bojom} bojom), kratka 1 ili 2 (${BOJE_DULJINE.kratka.bojom}). Broj slogova se računa iz riječi; ispravi ga s − i + ako pravilo griješi.`)
          : h("div", { class: "z-krug-glava" },
            h("span", {}, `Krugova ispod slike: ${s.krugova}`),
            h("button", { type: "button", class: "gumb mali tihi", disabled: s.krugova <= KRUGOVA_MIN, onclick: () => { s.krugova--; oznaci(); osvjezi(); } }, "−"),
            h("button", { type: "button", class: "gumb mali tihi", disabled: s.krugova >= KRUGOVA_MAX, onclick: () => { s.krugova++; oznaci(); osvjezi(); } }, "+"),
            h("span", { class: "sitno blijedo" }, "Isti broj krugova ispod svake slike, da broj krugova ne oda odgovor."))),
      h("div", { class: "ploha z-slogovi-slike" }, ...s.slike.map((x, i) => h("div", { class: "z-slog-slot" },
        slot(x.rijec_id, (n) => { x.rijec_id = n; x.slogova = R(n)?.slogova ?? 1; }),
        h("div", { class: "z-slog-broj" },
          h("button", { type: "button", class: "gumb mali tihi", title: "Slog manje", disabled: x.slogova <= 1, onclick: () => { x.slogova--; oznaci(); osvjezi(); } }, "−"),
          h("span", {}, `${x.slogova} slog${x.slogova === 1 ? "" : x.slogova < 5 ? "a" : "ova"}`),
          h("button", { type: "button", class: "gumb mali tihi", title: "Slog više", disabled: x.slogova >= SLOGOVA_MAX, onclick: () => { x.slogova++; oznaci(); osvjezi(); } }, "+")),
        s.nacin === "duljina" ? oznakaDuljine(x.slogova) : kruzici(s.krugova, x.slogova),
        h("div", { class: "z-red-gumbi" },
          h("button", { type: "button", class: "gumb mali tihi", title: "Ranije", disabled: i === 0, onclick: () => { [s.slike[i - 1], s.slike[i]] = [s.slike[i], s.slike[i - 1]]; oznaci(); osvjezi(); } }, "←"),
          h("button", { type: "button", class: "gumb mali tihi", title: "Kasnije", disabled: i === s.slike.length - 1, onclick: () => { [s.slike[i + 1], s.slike[i]] = [s.slike[i], s.slike[i + 1]]; oznaci(); osvjezi(); } }, "→"),
          h("button", { type: "button", class: "gumb mali tihi opasno", title: "Makni", onclick: () => { s.slike.splice(i, 1); oznaci(); osvjezi(); } }, "×"))))),
      h("div", { class: "z-gumbi" },
        h("button", { type: "button", class: "gumb", disabled: s.slike.length >= SLOGOVI_SLIKA_MAX, onclick: () => { s.slike.push({ rijec_id: null, slogova: 1 }); oznaci(); osvjezi(); } }, "+ Dodaj sliku"),
        h("button", { type: "button", class: "gumb mali tihi", onclick: () => { s.slike = promijesaj(s.slike); oznaci(); osvjezi(); } }, "Promiješaj redoslijed")));
  }

  function uredi(): HTMLElement {
    if (vrsta === "scena") return urediScenu();
    if (vrsta === "slogovi") return urediSlogove();
    if (vrsta === "prvi_glas") return urediPrviGlas();
    if (vrsta === "percepcija") return urediPercepciju();
    if (vrsta === "odabir") {
      const s = sadrzaj as Odabir;
      return h("div", { class: "z-uredi" },
        ...s.stavke.map((x, i) => h("div", { class: "ploha z-red-uredi" },
          h("div", { class: "z-red-broj" }, String(i + 1)),
          h("div", { class: "z-odabir-zadana" }, h("small", {}, "Zadana"), slot(x.zadana, (n) => (x.zadana = n))),
          h("div", { class: "z-strelica" }, "→"),
          h("div", { class: "z-ponudeno" }, ...x.ponudeno.map((pid, j) => slot(pid, (n) => (x.ponudeno[j] = n), {
            uzor: x.zadana, nacin: j === x.tocno ? "rima" : "ne-rima", tocno: j === x.tocno, naTocno: () => (x.tocno = j), oznakaTocno: "rimuje se",
          }))),
          redGumbi(s.stavke, i))),
        h("button", { type: "button", class: "gumb", disabled: s.stavke.length >= MAX_REDOVA, title: s.stavke.length >= MAX_REDOVA ? `Najviše ${MAX_REDOVA} redova` : undefined, onclick: () => { s.stavke.push({ zadana: null, ponudeno: Array(PONUDENIH).fill(null), tocno: 0 }); oznaci(); osvjezi(); } }, "+ Dodaj red"));
    }
    if (vrsta === "uljez") {
      const s = sadrzaj as Uljez;
      return h("div", { class: "z-uredi" },
        ...s.stavke.map((x, i) => {
          const uzor = x.slike.find((id, j) => j !== x.uljez && id !== null) ?? null;
          return h("div", { class: "ploha z-red-uredi" },
            h("div", { class: "z-red-broj" }, String(i + 1)),
            h("div", { class: "z-cetiri" }, ...x.slike.map((pid, j) => slot(pid, (n) => (x.slike[j] = n), {
              uzor: j === x.uljez ? uzor : x.slike.find((id, k) => k !== j && k !== x.uljez && id !== null) ?? null,
              nacin: j === x.uljez ? "ne-rima" : "rima", tocno: j === x.uljez, naTocno: () => (x.uljez = j), oznakaTocno: "uljez",
            }))),
            redGumbi(s.stavke, i));
        }),
        h("button", { type: "button", class: "gumb", disabled: s.stavke.length >= MAX_REDOVA, title: s.stavke.length >= MAX_REDOVA ? `Najviše ${MAX_REDOVA} redova` : undefined, onclick: () => { s.stavke.push({ slike: Array(U_REDU).fill(null), uljez: 0 }); oznaci(); osvjezi(); } }, "+ Dodaj red"));
    }
    if (vrsta === "povezivanje") {
      const s = sadrzaj as Povezivanje;
      const makni = (i: number) => {
        s.parovi.splice(i, 1);
        s.desno_redoslijed = s.desno_redoslijed.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x));
        oznaci(); osvjezi();
      };
      return h("div", { class: "z-uredi" },
        h("p", { class: "blijedo sitno" }, "Upiši parove koji se rimuju. Desni stupac se na ekranu i papiru prikazuje promiješan (redoslijed vidiš u Ispisu)."),
        ...s.parovi.map((x, i) => h("div", { class: "ploha z-red-uredi" },
          h("div", { class: "z-red-broj" }, String(i + 1)),
          slot(x.lijevo, (n) => (x.lijevo = n)),
          h("div", { class: "z-strelica" }, "⟷"),
          slot(x.desno, (n) => (x.desno = n), { uzor: x.lijevo, nacin: "rima" }),
          h("div", { class: "z-red-gumbi" }, h("button", { type: "button", class: "gumb mali tihi opasno", title: "Makni par", onclick: () => makni(i) }, "×")))),
        h("div", { class: "z-gumbi" },
          s.parovi.length < 8 ? h("button", { type: "button", class: "gumb", onclick: () => { s.parovi.push({ lijevo: null, desno: null }); s.desno_redoslijed.push(s.parovi.length - 1); oznaci(); osvjezi(); } }, "+ Dodaj par") : null,
          h("button", { type: "button", class: "gumb tihi", onclick: () => { s.desno_redoslijed = promijesajRed(s.parovi.length); oznaci(); osvjezi(); } }, "Promiješaj desni stupac")));
    }
    const s = sadrzaj as Listic;
    const pune = s.kartice.filter((k) => k.rijec_id || k.tekst).length;
    const r = rasporedListica(Math.min(pune, LISTIC_PO_STRANICI), s.raspored, ...A4_LISTIC);
    return h("div", { class: "z-uredi" },
      h("div", { class: "ploha z-scena-dio" },
        h("div", { class: "z-dio-glava" }, h("b", {}, "Veličina slika")),
        h("div", { class: "z-prekidac" },
          ...([["auto", "Prema broju slika"], ["3x4", "Uvijek 3 × 4"]] as [RasporedListica, string][]).map(([k, t]) =>
            h("button", { type: "button", class: `z-tocno${(s.raspored ?? "3x4") === k ? " on" : ""}`, onclick: () => { s.raspored = k; oznaci(); osvjezi(); } }, t))),
        h("p", { class: "sitno blijedo" }, s.raspored === "auto"
          ? `Manje slika, veće slike. Sad ${pune} ${pune === 1 ? "slika" : pune < 5 ? "slike" : "slika"}: ${r.stupaca} × ${r.redova}, slika oko ${Math.floor(r.s / 10)} cm.${pune > LISTIC_PO_STRANICI ? ` Na stranicu stane ${LISTIC_PO_STRANICI}, ostale idu na sljedeću.` : ""}`
          : `12 slika na stranici, oko ${Math.floor(r.s / 10)} cm, bez obzira na broj slika (kao stari LogoMedo).`)),
      h("div", { class: "z-listic-uredi" }, ...s.kartice.map((k, i) => h("div", { class: "ploha z-kartica-uredi" },
        slot(k.rijec_id, (n) => { const stara = R(k.rijec_id); k.rijec_id = n; if (!k.tekst || (stara && k.tekst === VELIKO(stara.rijec))) k.tekst = n ? VELIKO(R(n)!.rijec) : ""; }),
        h("input", { type: "text", value: k.tekst, placeholder: "Tekst ispod slike", maxLength: 200, oninput: (e: Event) => { k.tekst = (e.target as HTMLInputElement).value; oznaci(); } }),
        redGumbi(s.kartice, i)))),
      h("button", { type: "button", class: "gumb", onclick: () => { s.kartice.push({ rijec_id: null, tekst: "" }); oznaci(); osvjezi(); } }, "+ Dodaj karticu"));
  }

  function promijesajRed(n: number): number[] {
    const r = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    if (n > 1 && r.every((x, i) => x === i)) r.push(r.shift()!);
    return r;
  }

  // ---------- Pogled: Dijete (interaktivno) ----------

  let odgovori: Odgovor[] = [];
  let rijeseno = new Set<number>();          // stavke / lijevi indeksi riješeni točno
  let spojevi: { l: number; d: number }[] = [];
  let odabranLijevi: number | null = null;

  let t0 = performance.now();               // vrijeme odgovora od početka rješavanja, ne od zadnjeg crtanja
  function resetRjesavanja() { odgovori = []; rijeseno = new Set(); spojevi = []; odabranLijevi = null; pogodeni = new Set(); nadjena = new Map(); pgKrug = 0; pgFaza = "kolo"; bojica = null; slogKrugova = new Map(); t0 = performance.now(); }
  let pgKrug = 0, pgFaza: "kolo" | "trazi" = "kolo";   // prvi glas: krug i faza u pregledu

  let orijentacijaPregleda: Orijentacija = "vodoravno";
  let pogodeni = new Set<number>();

  function dijeteScena(): HTMLElement {
    const s = sadrzaj as Scena;
    const ms = () => Math.round(performance.now() - t0);
    const rezultat = h("div", { class: "z-scena-rezultat sitno" });
    const opisi = () => {
      const tocnih = vidljiviGumbi(s).filter((g) => g.tocno).length;
      const o = ocijeni(vrsta, sadrzaj, odgovori);
      const krivih = odgovori.filter((x) => "gumb" in x && !s.gumbi[x.gumb]?.tocno).length;
      zamijeni(rezultat, pogodeni.size >= tocnih && tocnih
        ? h("span", { class: "z-bravo" }, h("b", {}, "Bravo!"), ` Točno ${o.tocnih} od ${o.ukupno} odluka, ${krivih} krivih dodira.`)
        : h("span", { class: "blijedo" }, `Pogođeno ${pogodeni.size} od ${tocnih}. Krivih dodira: ${krivih}.`));
    };
    const okvir = h("div", { class: `z-tablet ${orijentacijaPregleda}` }, scenaPrikaz({
      sadrzaj: s, pitanje: uputa, pozadina: pozadina(s.pozadina_id), rijeci: rijeci as any, orijentacija: orijentacijaPregleda, pogodeni,
      naDodir: (i) => { odgovori.push({ gumb: i, ms: ms() }); opisi(); },
      naKraj: opisi,
    }));
    opisi();
    const poz = slikaZa(pozadina(s.pozadina_id), orijentacijaPregleda);
    return h("div", { class: "z-scena-pregled" },
      h("div", { class: "z-scena-alati" },
        ...(["vodoravno", "uspravno"] as const).map((o) => h("button", { type: "button", class: `z-cip${orijentacijaPregleda === o ? " on" : ""}`,
          onclick: () => { orijentacijaPregleda = o; resetRjesavanja(); osvjezi(); } }, o === "vodoravno" ? "Tablet vodoravno" : "Tablet uspravno")),
        h("button", { type: "button", class: "gumb mali tihi", onclick: () => { resetRjesavanja(); osvjezi(); } }, "Ponovi"),
        rezultat),
      poz && !poz.tocna ? h("p", { class: "sitno z-greska-polja" }, `Situacija nema ${orijentacijaPregleda === "uspravno" ? "uspravnu" : "vodoravnu"} sliku: prikazana je druga, s obrubom.`) : null,
      okvir);
  }

  let nadjena = new Map<number, Set<number>>();   // percepcija: pronađena točna polja po redu

  function dijetePercepcija(glava: HTMLElement, kraj: (n: number) => HTMLElement | null, ms: () => number): HTMLElement {
    const s = sadrzaj as Percepcija;
    return h("div", { class: "z-dijete z-percepcija" }, glava,
      ...s.stavke.map((x, i) => {
        const gotov = rijeseno.has(i);
        const moja = nadjena.get(i) ?? new Set<number>();
        return h("div", { class: `z-zadatak z-red-n${gotov ? " gotov" : ""}`, style: `--n:${x.polja.length}` }, ...x.polja.map((p, j) => {
          const b = h("button", { type: "button", class: `z-karta${moja.has(j) ? (s.trazi === "razlicitu" ? " uljez-pogodak" : " pogodak") : ""}`, onclick: () => {
            if (rijeseno.has(i) || moja.has(j)) return;
            odgovori.push({ stavka: i, odabrano: j, ms: ms() });
            if (!x.tocno.includes(j)) { b.classList.remove("krivo"); void b.offsetWidth; b.classList.add("krivo"); return; }
            moja.add(j); nadjena.set(i, moja);
            if (x.tocno.every((t) => moja.has(t))) rijeseno.add(i);
            osvjezi();
          } }, slika(p.rijec_id, "", false, p.izmjena));
          return b;
        }));
      }), kraj(s.stavke.length));
  }

  function dijetePrviGlas(): HTMLElement {
    const s = sadrzaj as PrviGlas;
    const ms = () => Math.round(performance.now() - t0);
    const krugovi = s.krugovi.map((k, i) => ({ k, i })).filter(({ k }) => krugUIgri(s, k));
    const glava = (tekst: string, ...d: Dijete[]) => h("div", { class: "z-dijete-glava" }, h("h2", {}, naslov || VRSTE[vrsta].naziv), h("p", {}, tekst, ...d));
    if (!krugovi.length) return h("div", { class: "z-dijete" }, glava("Nijedan krug nema slovo i slike koje počinju njime."));
    if (pgKrug >= krugovi.length) {
      const o = ocijeni(vrsta, sadrzaj, odgovori);
      return h("div", { class: "z-dijete" }, glava(""), h("div", { class: "z-bravo" }, h("b", {}, "Bravo!"), ` Iz prvog pokušaja bez krivog dodira ${o.tocnih} od ${o.ukupno} krugova.`,
        h("button", { type: "button", class: "gumb mali", onclick: () => { resetRjesavanja(); osvjezi(); } }, "Ponovi")));
    }
    const { k, i } = krugovi[pgKrug];
    const oznaka = krugovi.length > 1 ? h("span", { class: "sitno blijedo" }, ` (krug ${pgKrug + 1} od ${krugovi.length})`) : null;
    if (pgFaza === "kolo") {
      const kolo = koloSlova({ slova: s.kolo, boje: s.boje, cilj: k.slovo!, naKraj: (sl) => {
        dodaj(kolo.el, iskocenoSlovo(sl));
        setTimeout(() => { pgFaza = "trazi"; osvjezi(); }, 1500);
      } });
      return h("div", { class: "z-dijete z-prvi-glas" }, glava(UPUTE_PRVOG_GLASA.kolo, oznaka), h("div", { class: "z-kolo-okvir" }, kolo.el));
    }
    const moja = nadjena.get(i) ?? new Set<number>();
    const gotov = rijeseno.has(i);
    const tekst = UPUTE_PRVOG_GLASA.ekran.replace(" {slovo}.", "");
    return h("div", { class: "z-dijete z-prvi-glas" },
      glava(`${tekst} `, znackaSlova(k.slovo!), oznaka),
      h("div", { class: `z-krug-mreza${gotov ? " gotov" : ""}`, style: `--stupaca:${k.slike.length > 12 ? 5 : 4}` }, ...k.slike.map((id, j) => {
        if (id === null) return null;
        const b = h("button", { type: "button", class: `z-karta${moja.has(j) ? " pogodak" : ""}`, onclick: () => {
          if (rijeseno.has(i) || moja.has(j)) return;
          odgovori.push({ stavka: i, odabrano: j, ms: ms() });
          if (!k.tocno.includes(j)) { b.classList.remove("krivo"); void b.offsetWidth; b.classList.add("krivo"); return; }
          moja.add(j); nadjena.set(i, moja);
          if (k.tocno.every((t) => moja.has(t))) rijeseno.add(i);
          osvjezi();
        } }, slika(id, "", sRijecima));
        return b;
      })),
      gotov ? h("div", { class: "z-bravo" }, h("b", {}, "Bravo!"), ` Sve slike s glasom ${k.slovo}.`,
        h("button", { type: "button", class: "gumb mali glavni", onclick: () => { pgKrug++; pgFaza = "kolo"; osvjezi(); } }, pgKrug + 1 < krugovi.length ? "Sljedeći krug" : "Gotovo")) : null);
  }

  let bojica: "duga" | "kratka" | null = null;     // slogovi, duljina: odabrana bojica
  let slogKrugova = new Map<number, number>();      // slogovi, analiza: obojeni krugovi po slici

  function dijeteSlogovi(glava: HTMLElement, kraj: (n: number) => HTMLElement | null, ms: () => number): HTMLElement {
    const s = sadrzaj as Slogovi;
    const pune = s.slike.map((x, i) => ({ ...x, i })).filter((x) => x.rijec_id !== null);
    const tresi = (b: Element) => { b.classList.remove("krivo"); void (b as HTMLElement).offsetWidth; b.classList.add("krivo"); };
    if (s.nacin === "duljina") {
      const bojice = h("div", { class: "z-bojice" }, ...(["duga", "kratka"] as const).map((k) => h("button", {
        type: "button", class: `z-bojica ${k}${bojica === k ? " on" : ""}`, style: `--b:${BOJE_DULJINE[k].boja}`, onclick: () => { bojica = k; osvjezi(); },
      }, h("i", {}), BOJE_DULJINE[k].naziv)));
      return h("div", { class: "z-dijete z-slogovi" }, glava, bojice,
        h("div", { class: "z-krug-mreza", style: "--stupaca:4" }, ...pune.map((x) => {
          const gotova = rijeseno.has(x.i);
          const b = h("button", { type: "button", class: `z-karta${gotova ? " obojena" : ""}`, style: gotova ? `--b:${BOJE_DULJINE[jeDuga(x.slogova) ? "duga" : "kratka"].boja}` : undefined, onclick: () => {
            if (rijeseno.has(x.i)) return;
            if (!bojica) { bojice.querySelectorAll(".z-bojica").forEach(tresi); return; }
            odgovori.push({ stavka: x.i, odabrano: bojica === "duga" ? 1 : 0, ms: ms() });
            if ((bojica === "duga") !== jeDuga(x.slogova)) { tresi(b); return; }
            rijeseno.add(x.i); osvjezi();
          } }, slika(x.rijec_id, "", sRijecima));
          return b;
        })), kraj(pune.length));
    }
    return h("div", { class: "z-dijete z-slogovi" }, glava,
      h("div", { class: "z-krug-mreza z-slog-mreza", style: "--stupaca:3" }, ...pune.map((x) => {
        const gotova = rijeseno.has(x.i);
        const n = slogKrugova.get(x.i) ?? 0;
        const kartica = h("div", { class: `z-slog-zadatak${gotova ? " gotov" : ""}` }, slika(x.rijec_id, "", sRijecima),
          h("div", { class: "z-slog-krugovi velike" }, ...Array.from({ length: s.krugova }, (_, j) => h("button", { type: "button", class: j < n ? "on" : "", disabled: gotova, "aria-label": String(j + 1), onclick: () => {
            slogKrugova.set(x.i, n === j + 1 ? j : j + 1); osvjezi();
          } }))),
          gotova ? h("span", { class: "z-bravo-malo" }, "✓") : h("div", { class: "z-slog-gumbi" }, h("button", { type: "button", class: "gumb mali z-bubanj", title: "Bubanj: udarac oboji sljedeći krug", "aria-label": "bubanj", onclick: () => {
            if (n < s.krugova) { slogKrugova.set(x.i, n + 1); osvjezi(); }
          } }, "🥁"), h("button", { type: "button", class: "gumb mali", onclick: () => {
            odgovori.push({ stavka: x.i, odabrano: n, ms: ms() });
            if (n === tocnoSlogovi("analiza", x.slogova)) { rijeseno.add(x.i); osvjezi(); } else tresi(kartica);
          } }, "Gotovo")));
        return kartica;
      })), kraj(pune.length));
  }

  function dijete(): HTMLElement {
    if (vrsta === "scena") return dijeteScena();
    if (vrsta === "prvi_glas") return dijetePrviGlas();
    const ms = () => Math.round(performance.now() - t0);
    const kraj = (ukupno: number) => {
      if (rijeseno.size < ukupno) return null;
      const o = ocijeni(vrsta, sadrzaj, odgovori);
      return h("div", { class: "z-bravo" }, h("b", {}, "Bravo!"), ` Iz prvog pokušaja točno ${o.tocnih} od ${o.ukupno}.`,
        h("button", { type: "button", class: "gumb mali", onclick: () => { resetRjesavanja(); osvjezi(); } }, "Ponovi"));
    };
    const glava = h("div", { class: "z-dijete-glava" }, h("h2", {}, naslov || VRSTE[vrsta].naziv), uputa ? h("p", {}, uputa) : null);
    if (vrsta === "percepcija") return dijetePercepcija(glava, kraj, ms);
    if (vrsta === "slogovi") return dijeteSlogovi(glava, kraj, ms);

    if (vrsta === "odabir" || vrsta === "uljez") {
      const st = (sadrzaj as Odabir | Uljez).stavke;
      const tocan = (i: number) => (vrsta === "odabir" ? (st[i] as Odabir["stavke"][0]).tocno : (st[i] as Uljez["stavke"][0]).uljez);
      const igraj = (i: number, j: number, gumb: HTMLElement) => {
        if (rijeseno.has(i)) return;
        odgovori.push({ stavka: i, odabrano: j, ms: ms() });
        if (j === tocan(i)) { rijeseno.add(i); osvjezi(); }
        else { gumb.classList.remove("krivo"); void gumb.offsetWidth; gumb.classList.add("krivo"); }
      };
      return h("div", { class: `z-dijete z-${vrsta}` }, glava,
        ...st.map((x, i) => {
          const gotov = rijeseno.has(i);
          if (vrsta === "odabir") {
            const o = x as Odabir["stavke"][0];
            return h("div", { class: `z-zadatak${gotov ? " gotov" : ""}` },
              h("div", { class: "z-zadana" }, slika(o.zadana, "velika")),
              h("div", { class: "z-izbori" }, ...o.ponudeno.map((pid, j) => {
                const b = h("button", { type: "button", class: `z-karta${gotov && j === o.tocno ? " pogodak" : ""}`, onclick: () => igraj(i, j, b) }, slika(pid));
                return b;
              })));
          }
          const u = x as Uljez["stavke"][0];
          return h("div", { class: `z-zadatak z-red4${gotov ? " gotov" : ""}` }, ...u.slike.map((pid, j) => {
            const b = h("button", { type: "button", class: `z-karta${gotov && j === u.uljez ? " uljez-pogodak" : ""}`, onclick: () => igraj(i, j, b) }, slika(pid));
            return b;
          }));
        }), kraj(st.length));
    }

    if (vrsta === "povezivanje") {
      const s = sadrzaj as Povezivanje;
      const platno = h("div", { class: "z-povezi" });
      const svg = document.createElementNS(SVG, "svg");
      svg.classList.add("z-crte");
      const lijevi = s.parovi.map((par, i) => h("button", {
        type: "button", class: `z-karta${odabranLijevi === i ? " odabran" : ""}${rijeseno.has(i) ? " spojen" : ""}`,
        onclick: () => { if (!rijeseno.has(i)) { odabranLijevi = odabranLijevi === i ? null : i; osvjezi(); } },
      }, slika(par.lijevo), h("i", { class: "z-tocka desno" })));
      const desni = s.desno_redoslijed.map((pi, k) => {
        const b = h("button", {
          type: "button", class: `z-karta${spojevi.some((x) => x.d === k) ? " spojen" : ""}`,
          onclick: () => {
            if (odabranLijevi === null || spojevi.some((x) => x.d === k)) return;
            odgovori.push({ lijevo: odabranLijevi, desno: k, ms: ms() });
            if (pi === odabranLijevi) { spojevi.push({ l: odabranLijevi, d: k }); rijeseno.add(odabranLijevi); odabranLijevi = null; osvjezi(); }
            else { b.classList.remove("krivo"); void b.offsetWidth; b.classList.add("krivo"); }
          },
        }, h("i", { class: "z-tocka lijevo" }), slika(s.parovi[pi].desno));
        return b;
      });
      dodaj(platno, svg, h("div", { class: "z-stupac" }, ...lijevi), h("div", { class: "z-stupac" }, ...desni));
      const crtajCrte = () => {
        const o = platno.getBoundingClientRect();
        zamijeni(svg, ...spojevi.map(({ l, d }) => {
          const a = lijevi[l].querySelector(".z-tocka")!.getBoundingClientRect(), b = desni[d].querySelector(".z-tocka")!.getBoundingClientRect();
          const c = document.createElementNS(SVG, "line");
          c.setAttribute("x1", String(a.x + a.width / 2 - o.x)); c.setAttribute("y1", String(a.y + a.height / 2 - o.y));
          c.setAttribute("x2", String(b.x + b.width / 2 - o.x)); c.setAttribute("y2", String(b.y + b.height / 2 - o.y));
          return c;
        }));
      };
      requestAnimationFrame(crtajCrte);
      new ResizeObserver(crtajCrte).observe(platno);
      return h("div", { class: "z-dijete" }, glava, platno, kraj(s.parovi.length));
    }

    return h("div", { class: "z-dijete" }, glava, listicMreza(sadrzaj as Listic));
  }

  /** A4 bez rubova i zaglavlja (mm), za raspored listića u HTML ispisu. */
  const A4_LISTIC: [number, number] = [180, 222];
  function listicMreza(s: Listic, a4 = false) {
    const pune = s.kartice.filter((k) => k.rijec_id || k.tekst);
    // Na papiru: mreža i veličina iz rasporedListica (isto kao PDF); prva stranica određuje veličinu.
    const r = rasporedListica(Math.min(pune.length, LISTIC_PO_STRANICI), s.raspored, ...A4_LISTIC, 7, pune.some((k) => k.tekst) ? 9 : 0);
    const stil = a4 ? `grid-template-columns:repeat(${r.stupaca},${Math.floor(r.s)}mm);justify-content:center` : s.raspored === "auto" && pune.length <= 6 ? `grid-template-columns:repeat(${r.stupaca},minmax(0,${pune.length <= 2 ? 340 : 240}px));justify-content:center` : undefined;
    return h("div", { class: "z-listic", style: stil }, ...pune.map((k) =>
      h("figure", {}, slika(k.rijec_id, "", false), h("figcaption", {}, k.tekst))));
  }

  // ---------- Pogled: Ispis (A4) ----------

  function ispis(): HTMLElement {
    let tijelo: HTMLElement;
    if (vrsta === "odabir") {
      tijelo = h("div", { class: "a4-odabir" }, ...(sadrzaj as Odabir).stavke.map((x) => h("div", { class: "a4-red" },
        h("div", { class: "a4-zadana" }, slika(x.zadana)), h("div", { class: "a4-crta" }),
        ...x.ponudeno.map((pid) => h("div", { class: "a4-izbor" }, slika(pid))))));
    } else if (vrsta === "uljez") {
      tijelo = h("div", { class: "a4-uljez" }, ...(sadrzaj as Uljez).stavke.map((x) => h("div", { class: "a4-red" },
        ...x.slike.map((pid) => h("div", { class: "a4-izbor" }, slika(pid))))));
    } else if (vrsta === "percepcija") {
      tijelo = h("div", { class: "a4-uljez a4-percepcija" }, ...(sadrzaj as Percepcija).stavke.map((x) => h("div", { class: "a4-red", style: `--n:${x.polja.length}` },
        ...x.polja.map((p) => h("div", { class: "a4-izbor" }, slika(p.rijec_id, "", false, p.izmjena))))));
    } else if (vrsta === "prvi_glas") {
      tijelo = h("div", { class: "a4-prvi-glas" }, ...(sadrzaj as PrviGlas).krugovi.map((k) => h("section", { class: "a4-krug" },
        h("div", { class: "a4-slovo" }, k.slovo ?? "?"),
        h("div", { class: "a4-krug-slike", style: `--stupaca:${k.slike.length > 12 ? 5 : 4}` }, ...k.slike.filter((x) => x !== null).map((id) => h("div", { class: "a4-izbor" }, slika(id, "", sRijecima)))))));
    } else if (vrsta === "slogovi") {
      const s = sadrzaj as Slogovi;
      const pune = s.slike.filter((x) => x.rijec_id !== null);
      tijelo = h("div", { class: `a4-slogovi ${s.nacin}` },
        s.nacin === "duljina" ? h("div", { class: "a4-legenda" }, ...(["duga", "kratka"] as const).map((k) => h("span", { style: `--b:${BOJE_DULJINE[k].boja}` }, h("i", { class: `a4-crta-boje ${k}` }), BOJE_DULJINE[k].naziv))) : null,
        h("div", { class: "a4-slogovi-mreza" }, ...pune.map((x) => h("div", { class: "a4-izbor" }, slika(x.rijec_id, "", sRijecima),
          s.nacin === "analiza" ? kruzici(s.krugova, 0, "a4-krugovi") : null))));
    } else if (vrsta === "povezivanje") {
      const s = sadrzaj as Povezivanje;
      tijelo = h("div", { class: "a4-povezi" },
        h("div", { class: "a4-stupac" }, ...s.parovi.map((x) => h("div", { class: "a4-par" }, slika(x.lijevo), h("i", { class: "a4-tocka" })))),
        h("div", { class: "a4-stupac" }, ...s.desno_redoslijed.map((pi) => h("div", { class: "a4-par" }, h("i", { class: "a4-tocka" }), slika(s.parovi[pi].desno)))));
    } else if (vrsta === "scena") {
      const s = sadrzaj as Scena;
      const poz = slikaZa(pozadina(s.pozadina_id), "uspravno");
      tijelo = h("div", { class: "a4-scena" },
        poz ? h("img", { class: "a4-pozadina", src: poz.slika.url, alt: "" }) : h("div", { class: "z-slika prazna a4-pozadina" }, h("span", {}, "pozadina")),
        h("div", { class: "a4-scena-gumbi" }, ...vidljiviGumbi(s).map((g) => h("div", { class: "a4-izbor" }, slika(g.rijec_id, "", true)))));
    } else {
      tijelo = listicMreza(sadrzaj as Listic, true);
    }
    return h("div", { class: "a4-okvir" }, h("article", { class: `a4 a4-${vrsta}` },
      h("header", {}, h("h1", {}, naslov || VRSTE[vrsta].naziv), uputa ? h("p", {}, uputa) : null,
        h("div", { class: "a4-ime" }, "Ime: ", h("span", {}))),
      tijelo,
      h("footer", {}, "logomedo.com")));
  }

  async function preuzmiPdf(e: Event) {
    const gumb = e.currentTarget as HTMLButtonElement;
    const tekst = gumb.textContent;
    gumb.disabled = true; gumb.textContent = "Pripremam PDF…";
    try {
      const [{ dokumentZadatka }, pdf] = await Promise.all([import("../pdf/model.ts"), import("../pdf/preglednik.ts")]);
      const dok = dokumentZadatka({ vrsta, naslov, uputa: vrsta === "scena" ? `${uputa} ${VRSTE.scena.ispis}.` : uputa, sadrzaj }, p.rijeci, sRijecima, pozadine);
      await pdf.preuzmiPdf(dok, pdf.imePdfa(dok.naslov), (g, u) => { gumb.textContent = u ? `Slike ${g}/${u}…` : "Pripremam PDF…"; });
      gumb.textContent = tekst;
    } catch (err) {
      console.error(err);
      gumb.textContent = "PDF nije uspio";
    } finally {
      gumb.disabled = false;
    }
  }

  // ---------- Okvir: kartice pogleda, bočna ploča, spremanje ----------

  const spremiGumb = h("button", { type: "button", class: "gumb glavni mali", disabled: true, onclick: spremi, title: "Spremi (⌘S / Ctrl+S)" }, "Spremljeno");
  const stanjeEl = h("span", { class: "z-stanje", hidden: true, role: "status" }, "● Promjene nisu spremljene");
  async function spremi() {
    spremiGumb.disabled = true; spremiGumb.textContent = "Spremam…";
    const o = await fetch(`/admin/api/zadatak/${z.id}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ naslov, uputa, podrucje_id: podrucje, stil, sadrzaj }),
    });
    const j: any = await o.json().catch(() => ({}));
    if (!o.ok) { spremiGumb.disabled = false; spremiGumb.textContent = "Spremi (greška)"; alert(j.error ?? `Greška ${o.status}`); return; }
    promijenjeno = false; spremiGumb.textContent = j.verzija !== z.aktivna_verzija ? `Spremljeno kao verzija ${j.verzija}` : "Spremljeno";
    z.aktivna_verzija = j.verzija;
    stanjeSpremanja();
  }
  // returnValue uz preventDefault: stariji Safari i neki Chromiumi bez njega ne pitaju.
  addEventListener("beforeunload", (e) => { if (promijenjeno) { e.preventDefault(); e.returnValue = ""; } });
  addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (promijenjeno) spremi(); } });

  function upozorenjaSvih() {
    const u = provjeri(vrsta, sadrzaj, rijeci);
    if (vrsta === "scena" && !uputa.trim()) u.unshift({ gdje: "scena", poruka: "Nema pitanja." });
    if (vrsta === "scena") {
      const s = sadrzaj as Scena;
      if (s.pozadina_id !== null && !pozadina(s.pozadina_id)) u.unshift({ gdje: "scena", poruka: "Odabrana pozadina je obrisana." });
      if (vidljiviGumbi(s).length < 2) u.push({ gdje: "scena", poruka: "Scena treba barem 2 slike." });
    }
    return u;
  }
  let plocaEl: HTMLElement | null = null;
  function osvjeziPlocu() { const stara = plocaEl; if (stara) (stara as any).replaceWith(ploca()); }

  function ploca(): HTMLElement {
    const upozorenja = upozorenjaSvih();
    const brojStavki = h("input", { type: "number", min: 1, max: 12, value: postavke.stavki, oninput: (e: Event) => (postavke.stavki = Number((e.target as HTMLInputElement).value) || 4) });
    return plocaEl = h("aside", { class: "z-ploca" },
      h("div", { class: "ploha z-polja" },
        h("label", {}, "Naslov"),
        h("input", { type: "text", value: naslov, maxLength: 200, placeholder: VRSTE[vrsta].naziv, oninput: (e: Event) => { naslov = (e.target as HTMLInputElement).value; oznaci(); } }),
        vrsta === "scena" ? null : h("label", {}, "Uputa djetetu"),
        vrsta === "scena" ? null : h("textarea", { rows: 2, maxLength: 400, value: uputa, oninput: (e: Event) => { uputa = (e.target as HTMLTextAreaElement).value; oznaci(); } }),
        h("label", {}, "Područje"),
        h("select", { onchange: (e: Event) => { podrucje = Number((e.target as HTMLSelectElement).value) || null; oznaci(); } },
          h("option", { value: "" }, "—"),
          ...p.podrucja.map((x) => h("option", { value: x.id, selected: x.id === podrucje }, x.naziv))),
        p.stilovi.length > 1 ? h("label", {}, "Slike") : null,
        p.stilovi.length > 1 ? h("select", { title: "Riječ bez slike u ovom stilu uzima sliku drugog stila.", onchange: (e: Event) => { postaviStil((e.target as HTMLSelectElement).value); oznaci(); osvjezi(); } },
          ...p.stilovi.map((x) => h("option", { value: x.kod, selected: x.kod === stil }, x.naziv))) : null,
        z.rjesavanja > 0 ? h("p", { class: "sitno blijedo" }, `Verzija ${z.aktivna_verzija} je rješavana ${z.rjesavanja}×: spremanje otvara novu verziju.`) : null),
      upozorenja.length
        ? h("div", { class: "ploha z-upozorenja" }, h("b", {}, `Upozorenja (${upozorenja.length})`),
          h("ul", {}, ...upozorenja.map((u) => h("li", {}, h("span", { class: "blijedo" }, `${u.gdje}: `), u.poruka))))
        : h("div", { class: "ploha z-upozorenja ok" }, "✓ Zadatak je ispravan."),
      VRSTE[vrsta].odnos || vrsta === "listic" || vrsta === "percepcija" || vrsta === "prvi_glas" || vrsta === "slogovi" ? h("details", { class: "ploha z-slozi" },
        h("summary", {}, "Složi automatski iz kataloga"),
        h("label", {}, vrsta === "povezivanje" ? "Parova" : vrsta === "listic" ? "Kartica (do 12)" : vrsta === "prvi_glas" ? "Krugova (do 6)" : vrsta === "slogovi" ? "Slika (do 12)" : "Redova"), brojStavki,
        vrsta === "slogovi" ? h("p", { class: "sitno blijedo" }, (sadrzaj as Slogovi).nacin === "duljina" ? "Pola kratkih (1–2 sloga), pola dugačkih (3 i više) riječi sa slikom." : "Podjednako riječi od 1 sloga do broja krugova.") : null,
        vrsta === "percepcija" ? h("p", { class: "sitno blijedo" }, "Nasumične riječi sa slikom, po jedna u redu.") : null,
        vrsta === "prvi_glas" ? h("p", { class: "sitno blijedo" }, `Nasumična slova s kola, svako s ${SLIKA_MIN} slika: 3–5 počinje tim glasom, ostale ne.`) : null,
        vrsta === "percepcija" || vrsta === "prvi_glas" || vrsta === "slogovi" ? null : h("label", { class: "z-kvacica" }, h("input", { type: "checkbox", checked: postavke.maxSlogova === 3, onchange: (e: Event) => (postavke.maxSlogova = (e.target as HTMLInputElement).checked ? 3 : 0) }), " Najviše 3 sloga"),
        vrsta === "percepcija" || vrsta === "prvi_glas" || vrsta === "slogovi" ? null : h("label", { class: "z-kvacica" }, h("input", { type: "checkbox", checked: postavke.samoSaSlikom, onchange: (e: Event) => (postavke.samoSaSlikom = (e.target as HTMLInputElement).checked) }), " Samo riječi sa slikom"),
        h("button", { type: "button", class: "gumb", onclick: () => {
          if (rijeciU(vrsta, sadrzaj).length && !confirm("Zamijeniti sadržaj novim prijedlogom?")) return;
          const prije = sadrzaj;
          sadrzaj = vrsta === "slogovi" ? slozSlogove((prije as Slogovi).nacin, p.rijeci, postavke.stavki, (prije as Slogovi).krugova) : slozi(vrsta, p.rijeci, postavke);
          // Prvi glas zadržava odabir slova na kolu; slova krugova biraju se samo s kola.
          if (vrsta === "prvi_glas") {
            const kolo = (prije as PrviGlas).kolo, s = sadrzaj as PrviGlas;
            s.kolo = [...kolo]; s.boje = (prije as PrviGlas).boje;
            s.krugovi = s.krugovi.map((k) => { if (k.slovo && kolo.includes(k.slovo)) return k; const iz = kolo.filter((sl) => brojSlova(sl) >= 3); return slozKrug(iz[Math.floor(Math.random() * iz.length)] ?? kolo[0], zaKrug()); });
          }
          // Percepcija zadržava izbor „različita / dvije iste".
          if (vrsta === "percepcija" && (prije as Percepcija).trazi === "par") {
            const s = sadrzaj as Percepcija;
            s.trazi = "par"; s.stavke = s.stavke.map((x) => slozRed(x.polja[0].rijec_id, x.polja.length, "par"));
          }
          oznaci(); resetRjesavanja(); osvjezi();
        } }, "Složi")) : null);
  }

  const kartice = h("nav", { class: "z-kartice" });
  const tijelo = h("div", { class: "z-tijelo" });
  dodaj(korijen, kartice, tijelo);

  function osvjezi() {
    zamijeni(kartice, 
      ...([["uredi", "Uredi"], ["dijete", "Dijete rješava"], ["ispis", "Ispis"]] as const).map(([k, t]) =>
        h("button", { type: "button", class: `z-kartica${pogled === k ? " on" : ""}`, onclick: () => { pogled = k; history.replaceState(null, "", `#${k}`); resetRjesavanja(); osvjezi(); } }, t)),
      h("span", { class: "z-razmak" }),
      pogled !== "uredi" ? h("label", { class: "z-kvacica" }, h("input", { type: "checkbox", checked: sRijecima, onchange: (e: Event) => { sRijecima = (e.target as HTMLInputElement).checked; osvjezi(); } }), " Riječi ispod slika") : null,
      pogled === "ispis" ? h("button", { type: "button", class: "gumb mali", title: "Dijalog za ispis preglednika", onclick: () => print() }, "Ispiši") : null,
      pogled === "ispis" ? h("button", { type: "button", class: "gumb glavni mali", onclick: preuzmiPdf }, "Preuzmi PDF") : null,
      pogled !== "uredi" ? h("button", { type: "button", class: "gumb mali", onclick: () => document.documentElement.requestFullscreen?.() }, "Cijeli zaslon") : null,
      stanjeEl, spremiGumb,
    );
    if (pogled === "uredi") zamijeni(tijelo, h("div", { class: "z-raspored" }, uredi(), ploca()));
    else if (pogled === "dijete") zamijeni(tijelo, h("p", { class: "sitno blijedo z-napomena" }, "Pregled kako dijete rješava. U adminu se rješavanje ne sprema."), dijete());
    else zamijeni(tijelo, ispis());
  }
  osvjezi();
}

// Za konzolu i testiranje ključa rime iz preglednika.
(globalThis as any).logomedoRima = { izvediRimu, brojSlogova };
