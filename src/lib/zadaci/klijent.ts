// Editor zadatka u pregledniku: tri pogleda istog sadržaja.
//   Uredi  – slotovi za slike, točan odgovor, upozorenja, spremanje
//   Dijete – interaktivno rješavanje na tabletu/ekranu (pregled; ne sprema se)
//   Ispis  – A4 stranica za papir: „Preuzmi PDF" (pdf-lib u pregledniku) ili window.print
// Sve se crta iz `stanje`; svaka promjena zove `osvjezi()`.

import { brojSlogova, izvediRimu, rimujuSe } from "./rima.ts";
import {
  ocijeni, provjeri, rijeciU, slikaUStilu, slozi, slozRed, tocnaPolja, izmjenaCss, VRSTE, IZMJENE, PONUDENIH, U_REDU, MAX_GUMBA, POLJA_MIN, POLJA_MAX, UPUTE_PERCEPCIJE,
  type Izmjena, type Listic, type Odabir, type Odgovor, type Percepcija, type Polje, type Povezivanje, type RijecZadatka, type Sadrzaj, type Scena, type Trazi, type Uljez, type Vrsta,
} from "./vrste.ts";
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
  const postavke = { stavki: vrsta === "povezivanje" ? 4 : 4, maxSlogova: 3, samoSaSlikom: false };

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
    const u = R(uzor);
    const trazi = h("input", { type: "text", placeholder: "Traži riječ ili rimu (npr. -ava)…", autofocus: true });
    const lista = h("div", { class: "z-lista" });
    const filtri = h("div", { class: "z-filtri" });
    const crtaj = () => {
      const q = trazi.value.trim().toLocaleLowerCase("hr");
      const rima = q.startsWith("-") ? VELIKO(q.slice(1)) : null;
      zamijeni(filtri, 
        ...(u ? ([["sve", "Sve"], ["rima", `Rimuje se s ${VELIKO(u.rijec)}`], ["ne-rima", `Ne rimuje se s ${VELIKO(u.rijec)}`]] as const).map(([k, t]) =>
          h("button", { type: "button", class: `z-cip${filtar === k ? " on" : ""}`, onclick: () => { filtar = k; crtaj(); } }, t)) : []),
        h("button", { type: "button", class: `z-cip${samoSlika ? " on" : ""}`, onclick: () => { samoSlika = !samoSlika; crtaj(); } }, "Samo sa slikom"),
      );
      const svi = p.rijeci.filter((r) =>
        (!q || (rima ? r.rima?.endsWith(rima) : r.rijec.toLocaleLowerCase("hr").includes(q))) &&
        (!samoSlika || r.slika) &&
        (!u || filtar === "sve" || (filtar === "rima" ? rimujuSe(u, r) : !rimujuSe(u, r) && r.id !== u.id)));
      zamijeni(lista, 
        ...svi.slice(0, 120).map((r) => h("button", {
          type: "button", class: `z-izbor${r.id === trenutna ? " on" : ""}`,
          onclick: () => { dlg.close(); gotovo(r.id); },
        }, slika(r.id, "mala", false), h("b", {}, VELIKO(r.rijec)), h("small", {}, r.rima ? `-${r.rima.toLocaleLowerCase("hr")}` : "bez rime"))),
        svi.length > 120 ? h("p", { class: "blijedo" }, `…i još ${svi.length - 120}. Suzi pretragu.`) : null,
        !svi.length ? h("p", { class: "blijedo" }, "Nema takvih riječi.") : null,
      );
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
    trazi.oninput = crtaj;
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
        h("div", { class: "z-dio-glava" }, h("b", {}, "1. Pozadina"),
          h("a", { class: "gumb mali tihi", href: "/admin/pozadine", target: "_blank" }, "Upravljaj pozadinama ↗")),
        pozadine.length
          ? h("div", { class: "z-pozadine" }, ...pozadine.map(sliciPozadine))
          : h("p", { class: "blijedo" }, "Još nema pozadina. ", h("a", { href: "/admin/pozadine", target: "_blank" }, "Dodaj prvu"), " pa osvježi ovu stranicu."),
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
      h("button", { type: "button", class: "gumb", onclick: () => { s.stavke.push(slozRed(null, s.stavke.at(-1)?.polja.length ?? 4, s.trazi)); oznaci(); osvjezi(); } }, "+ Dodaj red"));
  }

  function uredi(): HTMLElement {
    if (vrsta === "scena") return urediScenu();
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
        h("button", { type: "button", class: "gumb", onclick: () => { s.stavke.push({ zadana: null, ponudeno: Array(PONUDENIH).fill(null), tocno: 0 }); oznaci(); osvjezi(); } }, "+ Dodaj red"));
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
        h("button", { type: "button", class: "gumb", onclick: () => { s.stavke.push({ slike: Array(U_REDU).fill(null), uljez: 0 }); oznaci(); osvjezi(); } }, "+ Dodaj red"));
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
    return h("div", { class: "z-uredi" },
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
  function resetRjesavanja() { odgovori = []; rijeseno = new Set(); spojevi = []; odabranLijevi = null; pogodeni = new Set(); nadjena = new Map(); t0 = performance.now(); }

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
      poz && !poz.tocna ? h("p", { class: "sitno z-greska-polja" }, `Pozadina nema ${orijentacijaPregleda === "uspravno" ? "uspravnu" : "vodoravnu"} sliku: prikazana je druga, s obrubom.`) : null,
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

  function dijete(): HTMLElement {
    if (vrsta === "scena") return dijeteScena();
    const ms = () => Math.round(performance.now() - t0);
    const kraj = (ukupno: number) => {
      if (rijeseno.size < ukupno) return null;
      const o = ocijeni(vrsta, sadrzaj, odgovori);
      return h("div", { class: "z-bravo" }, h("b", {}, "Bravo!"), ` Iz prvog pokušaja točno ${o.tocnih} od ${o.ukupno}.`,
        h("button", { type: "button", class: "gumb mali", onclick: () => { resetRjesavanja(); osvjezi(); } }, "Ponovi"));
    };
    const glava = h("div", { class: "z-dijete-glava" }, h("h2", {}, naslov || VRSTE[vrsta].naziv), uputa ? h("p", {}, uputa) : null);
    if (vrsta === "percepcija") return dijetePercepcija(glava, kraj, ms);

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

  function listicMreza(s: Listic) {
    return h("div", { class: "z-listic" }, ...s.kartice.filter((k) => k.rijec_id || k.tekst).map((k) =>
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
      tijelo = listicMreza(sadrzaj as Listic);
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
      VRSTE[vrsta].odnos || vrsta === "listic" || vrsta === "percepcija" ? h("details", { class: "ploha z-slozi" },
        h("summary", {}, "Složi automatski iz kataloga"),
        h("label", {}, vrsta === "povezivanje" ? "Parova" : vrsta === "listic" ? "Kartica (do 12)" : "Redova"), brojStavki,
        vrsta === "percepcija" ? h("p", { class: "sitno blijedo" }, "Nasumične riječi sa slikom, po jedna u redu.") : null,
        vrsta === "percepcija" ? null : h("label", { class: "z-kvacica" }, h("input", { type: "checkbox", checked: postavke.maxSlogova === 3, onchange: (e: Event) => (postavke.maxSlogova = (e.target as HTMLInputElement).checked ? 3 : 0) }), " Najviše 3 sloga"),
        vrsta === "percepcija" ? null : h("label", { class: "z-kvacica" }, h("input", { type: "checkbox", checked: postavke.samoSaSlikom, onchange: (e: Event) => (postavke.samoSaSlikom = (e.target as HTMLInputElement).checked) }), " Samo riječi sa slikom"),
        h("button", { type: "button", class: "gumb", onclick: () => {
          if (rijeciU(vrsta, sadrzaj).length && !confirm("Zamijeniti sadržaj novim prijedlogom?")) return;
          const prije = sadrzaj;
          sadrzaj = slozi(vrsta, p.rijeci, postavke);
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
