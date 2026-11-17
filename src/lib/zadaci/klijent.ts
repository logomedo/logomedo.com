// Editor zadatka u pregledniku: tri pogleda istog sadržaja.
//   Uredi  – slotovi za slike, točan odgovor, upozorenja, spremanje
//   Dijete – interaktivno rješavanje na tabletu/ekranu (pregled; ne sprema se)
//   Ispis  – A4 stranica za papir: „Preuzmi PDF" (pdf-lib u pregledniku) ili window.print
// Sve se crta iz `stanje`; svaka promjena zove `osvjezi()`.

import { brojSlogova, izvediRimu } from "./rima.ts";
import { ciljeviGlasova, naslovListica, odgovara, redovaZaGlasove, type RijecGlasova, type VrstaOdnosa } from "./listic-glas.ts";
import { jeZadanaUputa, ODNOSI, odnosiZa, oznakaKljuca, uOdnosu, type Odnos } from "./odnosi.ts";
import {
  BROJ_STAVKI, brojStavki, brojUZadatku, odnosOd, provjeri, rijeciU, zadanaUputa, slikaUStilu, slozi, slozRed, tocnaPolja, izmjenaCss, VRSTE, IZMJENE, PONUDENIH, U_REDU, MAX_GUMBA, MAX_REDOVA, POLJA_MIN, POLJA_MAX, UPUTE_PERCEPCIJE,
  BOJE_DULJINE, DUGA_OD, izbroji, jedinica, krugovaZa, KRUGOVA_MIN, KRUGOVA_MAX, SLOGOVA_MAX, SLOGOVI_SLIKA_MAX, UPUTE_SLOGOVA, jeDuga, slozSlogove, type NacinSlogova, type Slogovi,
  LISTIC_PO_STRANICI, MREZA_MAX, MREZE_LISTICA, mrezaListica, poStraniciListica, rasporedListica, type RasporedListica,
  ABECEDA, BOJE_KOLA, jednaRijec, SLIKA_MIN, SLIKA_MAX, prviGlas, slozKrug, tocneSlike, type Krug, type PrviGlas,
  type GlasoviZadatka, type Izmjena, type Listic, type Odabir, type Percepcija, type Polje, type Povezivanje, type RijecZadatka, type Sadrzaj, type Scena, type Trazi, type Uljez, type Vrsta, zaGenerator,
} from "./vrste.ts";
import { usporediZnakove } from "../znakovi.ts";
import { izvorni, jeNapisano, mapaRijeci, novoPoljeNapisano, postaviUlogu, uObliku, ulogaNapisana, ulogeNapisano, VRSTE_NAPISANO } from "./napisano.ts";
import { slikaZa, vidljiviGumbi, type PozadinaPrikaz } from "../scena-prikaz.ts";
import { A4 as A4_MM, GOTOVI, imaOkvir, isti, KUTOVI, MASNE, normalizirajOkvir, okvirSvg, podrucje as podrucjeOkvira, RUBOVI, UKRASI, urlUkrasa, type Kutovi, type Okvir } from "../okviri.ts";

export interface Podaci {
  zadatak: { id: number; vrsta: Vrsta; naslov: string; uputa: string | null; podrucje_id: number | null; aktivna_verzija: number; rjesavanja: number; stil: string; sadrzaj: Sadrzaj; okvir: Okvir };

  rijeci: RijecZadatka[];
  /** Samo kad je zadatak složen po glasovima: id riječi → [id glasa, pozicija][]. */
  glasoviRijeci?: Record<number, [number, string][]>;
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

export function pokreni(korijen: HTMLElement, p: Podaci) {
  const z = p.zadatak;
  const vrsta = z.vrsta;
  // Uz svaku riječ i njezina napisana inačica (-id), napisano.ts.
  const rijeci = mapaRijeci(p.rijeci);
  /** Može li polje ove vrste biti napisana riječ (uparivanje, povezivanje, uljez). */
  const smijeNapisano = (VRSTE_NAPISANO as readonly string[]).includes(vrsta);
  const jeZnakId = (id: number) => !!R(id)?.znak;
  let sadrzaj: Sadrzaj = structuredClone(z.sadrzaj);
  let naslov = z.naslov, uputa = z.uputa ?? zadanaUputa(vrsta, z.sadrzaj), podrucje = z.podrucje_id, stil = z.stil;
  let okvir: Okvir = normalizirajOkvir(z.okvir);
  // Dijete rješava je zasebna stranica (/admin/zadaci/<id>/dijete), otvara se u novoj kartici.
  let pogled: "uredi" | "okvir" | "ispis" = (location.hash.slice(1) as any) || "uredi";
  if (!["uredi", "okvir", "ispis"].includes(pogled)) pogled = "uredi";
  let promijenjeno = false;
  let sRijecima = false;
  const glasovaZadatka = VRSTE[vrsta].odnos ? (sadrzaj as Odabir).po_glasovima?.glasovi.length ?? 0 : 0;
  // „Složi automatski” zadrži broj redova (parova, slika…) koji zadatak već ima.
  const postavke = { stavki: glasovaZadatka ? redovaZaGlasove(vrsta as VrstaOdnosa, glasovaZadatka, brojUZadatku(vrsta, sadrzaj)) : brojUZadatku(vrsta, sadrzaj), maxSlogova: 3, samoSaSlikom: false };

  /** Slike svih riječi u stilu zadatka (riječ bez slike u njemu uzima drugi stil). */
  function postaviStil(kod: string) {
    stil = kod;
    for (const r of p.rijeci) if (r.slike) r.slika = slikaUStilu(r.slike, stil);
  }
  const R = (id: number | null) => (id === null ? null : rijeci.get(id) ?? null);
  /** Odnos uparivanja, povezivanja i uljeza (rima, isti prvi glas…); ostale vrste prikazuju rimu. */
  const odnos = (): Odnos => (VRSTE[vrsta].odnos ? odnosOd(sadrzaj) : "rima");
  const oznakaRijeci = (r: RijecZadatka) => oznakaKljuca(odnos(), r);
  /** Glasovi odabrani pri izradi (predložak po glasovima), ako ih zadatak ima. */
  const poGlasovima = (): GlasoviZadatka | undefined => (VRSTE[vrsta].odnos ? (sadrzaj as Odabir).po_glasovima : undefined);
  const sGlasovima = (r: RijecZadatka): RijecGlasova => ({ id: r.id, rijec: r.rijec, rima: r.rima, g: p.glasoviRijeci?.[r.id] ?? [] });
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
    // Znak (slovo, brojka) je sam sebi slika: točno kako je upisan, izmjena (zrcalo, naopako) vrijedi i za njega.
    // Napisana riječ (napisano.ts): tiskana slova u polju, bez slike i natpisa.
    if (r.napisano) return h("div", { class: `z-slika z-napisano ${kl}` }, h("span", { class: "z-napisano-tekst", style: `--n:${[...r.rijec].length}` }, VELIKO(r.rijec)));
    if (r.znak) return h("div", { class: `z-slika z-znak-polje ${kl}` }, h("span", { class: "z-znak", style: [r.rijec.length > 1 ? `--m:${r.rijec.length > 2 ? 0.5 : 0.7}` : "", css ?? ""].filter(Boolean).join(";") || undefined }, r.rijec));
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
    // Slogovi i prvi glas: samo jedna riječ (izraz poput ČAROBNI ŠTAPIĆ nema smisla brojati).
    const samoJedne = vrsta === "slogovi" || vrsta === "prvi_glas";
    // Riječi (slike) ili znakovi (slova, brojke); polje koje već ima znak otvara znakove.
    let znakovi = !!R(trenutna)?.znak;
    const KORAK = 120;
    let koliko = KORAK; // „Učitaj još” povećava; nova pretraga ili filtar vraća na prvih KORAK
    const u = R(uzor);
    // Po glasovima zadatka: uključeno kad slika nema uzora (zadana, lijeva, prva u uljezu); uz uzor vrijedi odnos.
    const pg = poGlasovima();
    let poGlasu = !!pg && !u;
    const trazi = h("input", { type: "text", placeholder: "Traži riječ ili rimu (npr. -ava)…", autofocus: true });
    const lista = h("div", { class: "z-lista" });
    const filtri = h("div", { class: "z-filtri" });
    const crtaj = () => {
      const q = trazi.value.trim().toLocaleLowerCase("hr");
      const rima = q.startsWith("-") ? VELIKO(q.slice(1)) : null;
      zamijeni(filtri,
        ...([[false, "Riječi"], [true, "Znakovi"]] as const).map(([z, t]) =>
          h("button", { type: "button", class: `z-cip z-vrsta${znakovi === z ? " on" : ""}`, onclick: () => { znakovi = z; koliko = KORAK; crtaj(); } }, t)),
        ...(u && !znakovi ? ([["sve", "Sve"], ["rima", ODNOSI[odnos()].filtarDa(VELIKO(u.rijec))], ["ne-rima", ODNOSI[odnos()].filtarNe(VELIKO(u.rijec))]] as const).map(([k, t]) =>
          h("button", { type: "button", class: `z-cip${filtar === k ? " on" : ""}`, onclick: () => { filtar = k; koliko = KORAK; crtaj(); } }, t)) : []),
        znakovi ? null : h("button", { type: "button", class: `z-cip${samoSlika ? " on" : ""}`, onclick: () => { samoSlika = !samoSlika; koliko = KORAK; crtaj(); } }, "Samo sa slikom"),
        pg && !znakovi ? h("button", { type: "button", class: `z-cip${poGlasu ? " on" : ""}`, onclick: () => { poGlasu = !poGlasu; koliko = KORAK; crtaj(); } }, naslovListica(pg.oznake, pg.pozicija, pg.bez)) : null,
      );
      if (znakovi) {
        // Znak se traži točno (b nije B), a mreža ide redom: velika, mala, brojke.
        const t = trazi.value.trim();
        const zn = p.rijeci.filter((r) => r.znak && (!t || r.rijec === t || r.rijec.toLocaleLowerCase("hr") === t.toLocaleLowerCase("hr"))).sort((a, b) => usporediZnakove(a.rijec, b.rijec));
        zamijeni(lista, h("div", { class: "z-znakovi" }, ...zn.map((r) => h("button", {
          type: "button", class: `z-izbor-znak${r.id === trenutna ? " on" : ""}`, title: r.rijec,
          onclick: () => { dlg.close(); gotovo(r.id); },
        }, r.rijec))),
        !zn.length ? h("p", { class: "blijedo" }, "Nema takvog znaka. Novi znak dodaje se u Katalog › Znakovi.") : null);
        return;
      }
      const svi = p.rijeci.filter((r) => !r.znak && (!samoJedne || jednaRijec(r.rijec)) &&
        (!q || (rima ? r.rima?.endsWith(rima) : r.rijec.toLocaleLowerCase("hr").includes(q))) &&
        (!samoSlika || r.slika) &&
        (!poGlasu || odgovara(sGlasovima(r), pg!)) &&
        (!u || filtar === "sve" || (filtar === "rima" ? uOdnosu(odnos(), u, r) : !uOdnosu(odnos(), u, r) && r.id !== izvorni(u.id))));
      const pozicija = lista.scrollTop;
      zamijeni(lista, 
        ...svi.slice(0, koliko).map((r) => h("button", {
          type: "button", class: `z-izbor${trenutna !== null && r.id === izvorni(trenutna) ? " on" : ""}`,
          onclick: () => { dlg.close(); gotovo(r.id); },
        }, slika(r.id, "mala", false), h("b", {}, VELIKO(r.rijec)), h("small", {}, oznakaRijeci(r)))),
        svi.length > koliko ? h("div", { class: "z-jos" },
          h("button", { type: "button", class: "gumb", onclick: () => { koliko += KORAK; crtaj(); } }, `Učitaj još (${Math.min(KORAK, svi.length - koliko)})`),
          h("span", { class: "blijedo" }, `još ${svi.length - koliko} riječi`)) : null,
        !svi.length ? h("p", { class: "blijedo" }, "Nema takvih riječi.") : null,
      );
      lista.scrollTop = pozicija;
      const nova = trazi.value.trim();
      if (nova && !rima && !znakovi && !p.rijeci.some((r) => r.rijec.toLocaleLowerCase("hr") === nova.toLocaleLowerCase("hr"))) {
        dodaj(lista, h("button", { type: "button", class: "gumb mali", onclick: () => dodajRijec(nova) }, `+ Dodaj riječ „${VELIKO(nova)}” u katalog`));
      }
    };
    async function dodajRijec(t: string) {
      const o = await fetch("/admin/api/rijeci", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rijec: t }) });
      const j: any = await o.json();
      if (!o.ok) { alert(j.error ?? "Nije uspjelo"); return; }
      p.rijeci.push(j); p.rijeci.sort((a, b) => a.rijec.localeCompare(b.rijec, "hr")); mapaRijeci([j], rijeci);
      dlg.close(); gotovo(j.id);
    }
    trazi.oninput = () => { koliko = KORAK; lista.scrollTop = 0; crtaj(); };
    zamijeni(dlg, 
      h("div", { class: "z-birac-vrh" },
        h("b", {}, u && !u.znak ? `Uz ${VELIKO(u.rijec)} (${oznakaRijeci(u)})` : "Odaberi sliku ili znak"),
        trenutna !== null ? h("button", { type: "button", class: "gumb mali tihi", onclick: () => { dlg.close(); gotovo(null); } }, "Isprazni") : null,
        h("button", { type: "button", class: "gumb mali tihi", onclick: () => dlg.close() }, "Zatvori")),
      trazi, filtri, lista);
    crtaj();
    dlg.showModal();
  }

  /** Prazno polje (novi red) preuzima oblik svoje uloge (napisano.ts, novoPoljeNapisano). */
  const ulogaJeNapisana = (kljuc: string) => novoPoljeNapisano(vrsta, sadrzaj, kljuc, odnos(), jeZnakId);

  /** Slot u editoru: klik otvara birač. `uloga`: kojoj skupini polje pripada (ulogeNapisano). */
  function slot(id: number | null, postavi: (id: number | null) => void, o: { uzor?: number | null; nacin?: "rima" | "ne-rima"; tocno?: boolean; naTocno?: () => void; oznakaTocno?: string; uloga?: string } = {}) {
    const r = R(id);
    // Nova riječ u napisanom polju ostaje napisana, u praznom polju preuzima oblik svoje uloge (novi red
    // u napisanom stupcu je napisan); znak (slovo, brojka) je uvijek znak.
    const napisanoPolje = () => (id === null ? !!o.uloga && smijeNapisano && ulogaJeNapisana(o.uloga) : jeNapisano(id));
    const uPolje = (n: number | null) => (n !== null && !jeZnakId(n) && napisanoPolje() ? uObliku(n, true) : n);
    return h("div", { class: `z-slot${o.tocno ? " tocno" : ""}` },
      h("button", { type: "button", class: "z-slot-slika", title: "Promijeni sliku",
        onclick: () => biraj(id, o.uzor ?? null, o.nacin ?? null, (n) => { postavi(uPolje(n)); oznaci(); osvjezi(); }) },
        r ? slika(id, "", false) : h("div", { class: "z-slika prazna" }, h("span", {}, "+"))),
      h("div", { class: "z-slot-dno" },
        h("span", { class: "z-rijec" }, r ? VELIKO(r.rijec) : "prazno"),
        r && !r.znak && (r.rima || odnos() !== "rima") ? h("span", { class: "z-rima" }, oznakaRijeci(r)) : null),
      smijeNapisano && r && !r.znak ? h("button", { type: "button", class: `z-napisi${r.napisano ? " on" : ""}`,
        title: r.napisano ? "Prikaži sliku umjesto napisane riječi" : "Prikaži napisanu riječ umjesto slike",
        onclick: () => { postavi(uObliku(id!, !r.napisano)); oznaci(); osvjezi(); } }, r.napisano ? "Aa napisano" : "Aa napiši") : null,
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
      oznaci(); osvjezi();
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
  const zaKrug = () => { const rij = zaGenerator(p.rijeci).filter((r) => jednaRijec(r.rijec)), sa = rij.filter((r) => r.slika); return sa.length >= SLIKA_MIN ? sa : rij; };
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
            ? h("button", { type: "button", class: "gumb mali tihi", title: "Na kolu ostaju samo slova odabrana u krugovima", onclick: () => { s.kolo = [...slovaKrugova]; oznaci(); osvjezi(); } }, "Samo slova krugova") : null),
        h("div", { class: "z-kolo-slova" }, ...ABECEDA.map((sl) => h("button", { type: "button", class: `z-cip${naKolu(sl) ? " on" : ""}`, title: `${brojSlova(sl)} riječi u katalogu`, onclick: () => prebaci(sl) }, sl))),
        h("div", { class: "z-dio-glava" }, h("b", {}, "Boje kola")),
        h("div", { class: "z-kolo-boje" }, ...(Object.entries(BOJE_KOLA) as [keyof typeof BOJE_KOLA, (typeof BOJE_KOLA)[keyof typeof BOJE_KOLA]][]).map(([kod, b]) =>
          h("button", { type: "button", class: `z-cip${(s.boje ?? "sareno") === kod ? " on" : ""}`, onclick: () => { s.boje = kod; oznaci(); osvjezi(); } },
            h("span", { class: "z-kolo-uzorak", style: `background:conic-gradient(${b.polja.flatMap((c, i, a) => [`${c} ${(i / a.length) * 100}%`, `${c} ${((i + 1) / a.length) * 100}%`]).join(",")})` }), b.naziv))),
        h("p", { class: "sitno blijedo" }, "Dodirom na slovo ono se makne s kola ili vrati na njega. Kolo izgleda nasumično, a stane na slovo kruga. Slike koje počinju tim glasom označe se same (LJ, NJ i DŽ su jedan glas: LJULJAČKA ne počinje glasom L).")),
      ...s.krugovi.map((k, i) => {
        const tocnih = k.tocno.length;
        const promijeni = (n: number) => { s.krugovi[i] = slozKrug(k.slovo, zaKrug(), n); oznaci(); osvjezi(); };
        return h("div", { class: "ploha z-krug" },
          h("div", { class: "z-krug-glava" },
            h("div", { class: "z-red-broj" }, String(i + 1)),
            h("label", { class: "z-krug-slovo" }, "Kolo stane na ",
              h("select", { class: k.slovo && naKolu(k.slovo) ? "" : "neispravno", onchange: (e: Event) => { k.slovo = (e.target as HTMLSelectElement).value || null; uskladiKrug(k); oznaci(); osvjezi(); } },
                h("option", { value: "" }, "—"),
                // Slovo maknuto s kola ostaje vidljivo, da se zna zašto igra preskače krug.
                k.slovo && !naKolu(k.slovo) ? h("option", { value: k.slovo, selected: true }, `${k.slovo} (nije na kolu)`) : null,
                ...s.kolo.map((sl) => h("option", { value: sl, selected: sl === k.slovo }, sl)))),
            k.slovo && !naKolu(k.slovo) ? h("span", { class: "sitno", style: "color:var(--greska)" }, "Slovo nije na kolu: igra preskače ovaj krug.") : null,
            k.slovo ? h("span", { class: "sitno blijedo" }, `${tocnih} od ${k.slike.filter((x) => x !== null).length} slika počinje glasom ${k.slovo}`) : null,
            h("div", { class: "z-red-gumbi z-percepcija-alati" },
              h("button", { type: "button", class: "gumb mali", disabled: !k.slovo, title: "Nove slike iz kataloga za ovo slovo", onclick: () => promijeni(k.slike.length) }, "Složi slike"),
              h("button", { type: "button", class: "gumb mali tihi", title: "Drugo slovo i nove slike", onclick: () => { s.krugovi[i] = slozKrug(nasumicnoSlovo(), zaKrug(), k.slike.length); oznaci(); osvjezi(); } }, "Nasumično slovo"),
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
  // Do 4 kruga u jednom redu, više u dva ujednačena reda (7 → 4 + 3), kao u PDF-u.
  const kruzici = (n: number, obojeno = 0, kl = "z-slog-krugovi") => h("div", { class: kl, style: `--k:${n <= 4 ? n : Math.ceil(n / 2)};grid-template-columns:repeat(var(--k),auto)` }, ...Array.from({ length: n }, (_, i) => h("i", { class: i < obojeno ? "on" : "" })));
  const oznakaDuljine = (slogova: number) => { const k = jeDuga(slogova) ? "duga" : "kratka"; return h("span", { class: "z-duljina", style: `--b:${BOJE_DULJINE[k].boja}` }, BOJE_DULJINE[k].naziv); };

  function urediSlogove(): HTMLElement {
    const s = sadrzaj as Slogovi;
    const promijeniNacin = (n: NacinSlogova) => {
      if (n === s.nacin) return;
      if (uputa === UPUTE_SLOGOVA[s.nacin].ispis || !uputa.trim()) uputa = UPUTE_SLOGOVA[n].ispis;
      // Prelazak na glasove ili sa njih mijenja što se broji: brojevi se računaju iznova iz riječi.
      if ((n === "glasovi") !== (s.nacin === "glasovi")) for (const x of s.slike) { const r = R(x.rijec_id); if (r) x.slogova = izbroji(n, r.rijec); }
      s.nacin = n;
      if (n !== "duljina") dosegniKrugove();
      oznaci(); osvjezi();
    };
    /** Krugova nikad manje nego što treba najduža riječ (da dijete može obojiti sve). */
    const dosegniKrugove = () => { s.krugova = Math.max(s.krugova, krugovaZa(s.slike, KRUGOVA_MIN)); };
    return h("div", { class: "z-uredi" },
      h("div", { class: "ploha z-scena-dio" },
        h("div", { class: "z-dio-glava" }, h("b", {}, "Što dijete radi")),
        h("div", { class: "z-prekidac" },
          ...([["duljina", "Dugačke i kratke riječi"], ["analiza", "Slogovi u riječi (krugovi)"], ["glasovi", "Glasovi u riječi (krugovi)"]] as const).map(([k, t]) =>
            h("button", { type: "button", class: `z-tocno${s.nacin === k ? " on" : ""}`, onclick: () => promijeniNacin(k) }, t))),
        s.nacin === "duljina"
          ? h("p", { class: "sitno blijedo" }, `Dugačka riječ ima ${DUGA_OD} ili više slogova (${BOJE_DULJINE.duga.bojom} bojom), kratka 1 ili 2 (${BOJE_DULJINE.kratka.bojom}). Broj slogova se računa iz riječi; ispravi ga s − i + ako pravilo griješi.`)
          : h("div", { class: "z-krug-glava" },
            h("span", {}, `Krugova ispod slike: ${s.krugova}`),
            h("button", { type: "button", class: "gumb mali tihi", disabled: s.krugova <= KRUGOVA_MIN, onclick: () => { s.krugova--; oznaci(); osvjezi(); } }, "−"),
            h("button", { type: "button", class: "gumb mali tihi", disabled: s.krugova >= KRUGOVA_MAX, onclick: () => { s.krugova++; oznaci(); osvjezi(); } }, "+"),
            h("button", { type: "button", class: "gumb mali tihi", title: "Koliko treba najduža riječ", onclick: () => { s.krugova = krugovaZa(s.slike, KRUGOVA_MIN); oznaci(); osvjezi(); } }, "Prema riječima"),
            h("span", { class: "sitno blijedo" }, "Isti broj krugova ispod svake slike, da broj krugova ne oda odgovor. Raste sam kad dodaš dužu riječ."))),
      h("div", { class: "ploha z-slogovi-slike" }, ...s.slike.map((x, i) => h("div", { class: "z-slog-slot" },
        slot(x.rijec_id, (n) => { x.rijec_id = n; const r = R(n); x.slogova = r ? izbroji(s.nacin, r.rijec) : 1; dosegniKrugove(); }),
        h("div", { class: "z-slog-broj" },
          h("button", { type: "button", class: "gumb mali tihi", title: "Jedan manje", disabled: x.slogova <= 1, onclick: () => { x.slogova--; oznaci(); osvjezi(); } }, "−"),
          h("span", {}, jedinica(s.nacin, x.slogova)),
          h("button", { type: "button", class: "gumb mali tihi", title: "Jedan više", disabled: x.slogova >= SLOGOVA_MAX, onclick: () => { x.slogova++; dosegniKrugove(); oznaci(); osvjezi(); } }, "+")),
        s.nacin === "duljina" ? oznakaDuljine(x.slogova) : kruzici(s.krugova, x.slogova),
        h("div", { class: "z-red-gumbi" },
          h("button", { type: "button", class: "gumb mali tihi", title: "Ranije", disabled: i === 0, onclick: () => { [s.slike[i - 1], s.slike[i]] = [s.slike[i], s.slike[i - 1]]; oznaci(); osvjezi(); } }, "←"),
          h("button", { type: "button", class: "gumb mali tihi", title: "Kasnije", disabled: i === s.slike.length - 1, onclick: () => { [s.slike[i + 1], s.slike[i]] = [s.slike[i], s.slike[i + 1]]; oznaci(); osvjezi(); } }, "→"),
          h("button", { type: "button", class: "gumb mali tihi opasno", title: "Makni", onclick: () => { s.slike.splice(i, 1); oznaci(); osvjezi(); } }, "×"))))),
      h("div", { class: "z-gumbi" },
        h("button", { type: "button", class: "gumb", disabled: s.slike.length >= SLOGOVI_SLIKA_MAX, onclick: () => { s.slike.push({ rijec_id: null, slogova: 1 }); oznaci(); osvjezi(); } }, "+ Dodaj sliku"),
        h("button", { type: "button", class: "gumb mali tihi", onclick: () => { s.slike = promijesaj(s.slike); oznaci(); osvjezi(); } }, "Promiješaj redoslijed")));
  }

  /** Što povezuje slike: promjena odnosa zadržava slike (upozorenja pokažu što ne odgovara) i zadanu uputu mijenja novom. */
  function prekidacOdnosa(s: Odabir | Povezivanje | Uljez): HTMLElement {
    const v = vrsta as "odabir" | "povezivanje" | "uljez";
    const promijeni = (o: Odnos) => {
      if (o === s.odnos) return;
      if (jeZadanaUputa(uputa)) uputa = ODNOSI[o].uputa[v];
      s.odnos = o;
      // Riječ i slika: zadane / desni stupac napisani, ponuđene / lijevi stupac slike.
      if (o === "ista_rijec") for (const u of ulogeNapisano(vrsta, s)) postaviUlogu(u, u.kljuc === "zadana" || u.kljuc === "desno", jeZnakId);
      oznaci(); osvjezi();
    };
    return h("div", { class: "ploha z-scena-dio" },
      h("div", { class: "z-dio-glava" }, h("b", {}, "Što povezuje slike")),
      h("div", { class: "z-prekidac" },
        ...odnosiZa(v).map((o) => h("button", { type: "button", class: `z-tocno${s.odnos === o ? " on" : ""}`, onclick: () => promijeni(o) }, ODNOSI[o].naziv))),
      h("p", { class: "sitno blijedo" }, "Slike ostaju; što više ne odgovara, piše u upozorenjima. „Složi automatski” slaže nove po ovom odnosu."),
      h("div", { class: "z-dio-glava" }, h("b", {}, "Napisane riječi umjesto slika"), h("span", { class: "sitno blijedo" }, "dijete čita; pojedino polje: „Aa” ispod njega")),
      h("div", { class: "z-prekidac" },
        ...ulogeNapisano(vrsta, s).map((u) => {
          const on = ulogaNapisana(u, jeZnakId);
          return h("button", { type: "button", class: `z-tocno${on ? " on" : ""}`, disabled: !u.polja.some((x) => x.daj() !== null),
            onclick: () => { postaviUlogu(u, !on, jeZnakId); oznaci(); osvjezi(); } }, `${on ? "✓ " : ""}${u.naziv}: napisano`);
        })),
      h("p", { class: "sitno blijedo" }, "Brojke i slova biraju se kao znakovi (u biraču „Znakovi”)."));
  }

  function uredi(): HTMLElement {
    if (vrsta === "scena") return urediScenu();
    if (vrsta === "slogovi") return urediSlogove();
    if (vrsta === "prvi_glas") return urediPrviGlas();
    if (vrsta === "percepcija") return urediPercepciju();
    if (vrsta === "odabir") {
      const s = sadrzaj as Odabir;
      return h("div", { class: "z-uredi" }, prekidacOdnosa(s),
        ...s.stavke.map((x, i) => h("div", { class: "ploha z-red-uredi" },
          h("div", { class: "z-red-broj" }, String(i + 1)),
          h("div", { class: "z-odabir-zadana" }, h("small", {}, "Zadana"), slot(x.zadana, (n) => (x.zadana = n), { uzor: x.ponudeno[x.tocno], nacin: "rima", uloga: "zadana" })),
          h("div", { class: "z-strelica" }, "→"),
          h("div", { class: "z-ponudeno" }, ...x.ponudeno.map((pid, j) => slot(pid, (n) => (x.ponudeno[j] = n), {
            uzor: x.zadana, nacin: j === x.tocno ? "rima" : "ne-rima", tocno: j === x.tocno, naTocno: () => (x.tocno = j), oznakaTocno: ODNOSI[s.odnos].oznakaTocno, uloga: "ponudeno",
          }))),
          redGumbi(s.stavke, i))),
        h("button", { type: "button", class: "gumb", disabled: s.stavke.length >= MAX_REDOVA, title: s.stavke.length >= MAX_REDOVA ? `Najviše ${MAX_REDOVA} redova` : undefined, onclick: () => { s.stavke.push({ zadana: null, ponudeno: Array(PONUDENIH).fill(null), tocno: 0 }); oznaci(); osvjezi(); } }, "+ Dodaj red"));
    }
    if (vrsta === "uljez") {
      const s = sadrzaj as Uljez;
      return h("div", { class: "z-uredi" }, prekidacOdnosa(s),
        ...s.stavke.map((x, i) => {
          const uzor = x.slike.find((id, j) => j !== x.uljez && id !== null) ?? null;
          return h("div", { class: "ploha z-red-uredi" },
            h("div", { class: "z-red-broj" }, String(i + 1)),
            h("div", { class: "z-cetiri" }, ...x.slike.map((pid, j) => slot(pid, (n) => (x.slike[j] = n), {
              uzor: j === x.uljez ? uzor : x.slike.find((id, k) => k !== j && k !== x.uljez && id !== null) ?? null,
              nacin: j === x.uljez ? "ne-rima" : "rima", tocno: j === x.uljez, naTocno: () => (x.uljez = j), oznakaTocno: "uljez", uloga: "sve",
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
      return h("div", { class: "z-uredi" }, prekidacOdnosa(s),
        h("p", { class: "blijedo sitno" }, `Upiši parove koji ${ODNOSI[s.odnos].mnozina}. Desni stupac se na ekranu i papiru prikazuje promiješan (redoslijed vidiš u Ispisu).`),
        ...s.parovi.map((x, i) => h("div", { class: "ploha z-red-uredi" },
          h("div", { class: "z-red-broj" }, String(i + 1)),
          // Obje strane se ravnaju jedna po drugoj: koja je prva odabrana, druga nudi riječi u odnosu s njom.
          slot(x.lijevo, (n) => (x.lijevo = n), { uzor: x.desno, nacin: "rima", uloga: "lijevo" }),
          h("div", { class: "z-strelica" }, "⟷"),
          slot(x.desno, (n) => (x.desno = n), { uzor: x.lijevo, nacin: "rima", uloga: "desno" }),
          h("div", { class: "z-red-gumbi" }, h("button", { type: "button", class: "gumb mali tihi opasno", title: "Makni par", onclick: () => makni(i) }, "×")))),
        h("div", { class: "z-gumbi" },
          s.parovi.length < 8 ? h("button", { type: "button", class: "gumb", onclick: () => { s.parovi.push({ lijevo: null, desno: null }); s.desno_redoslijed.push(s.parovi.length - 1); oznaci(); osvjezi(); } }, "+ Dodaj par") : null,
          h("button", { type: "button", class: "gumb tihi", onclick: () => { s.desno_redoslijed = promijesajRed(s.parovi.length); oznaci(); osvjezi(); } }, "Promiješaj desni stupac")));
    }
    const s = sadrzaj as Listic;
    const pune = s.kartice.filter((k) => k.rijec_id || k.tekst).length;
    const raspored = s.raspored ?? "3x4";
    const r = rasporedListica(Math.min(pune, poStraniciListica(raspored)), raspored, ...prostorListica(true));
    const postavi = (k: RasporedListica) => { s.raspored = k; oznaci(); osvjezi(); };
    // Vlastita mreža: zadnja upisana (ili trenutna kad nije među ponuđenima).
    const m = mrezaListica(raspored);
    const vlastita = m && !(MREZE_LISTICA as readonly string[]).includes(raspored);
    const broj = (v: number, max: number, naziv: string, promjena: (n: number) => void) => h("input", {
      type: "number", min: 1, max, value: v, class: "z-mreza-broj", "aria-label": naziv,
      onchange: (e: Event) => { const n = Math.round(Number((e.target as HTMLInputElement).value)); if (n >= 1 && n <= max) promjena(n); else osvjezi(); },
    });
    const mc = m?.stupaca ?? 4, mr = m?.redova ?? 5;
    const stranica = poStraniciListica(raspored);
    return h("div", { class: "z-uredi" },
      h("div", { class: "ploha z-scena-dio" },
        h("div", { class: "z-dio-glava" }, h("b", {}, "Veličina slika"), h("span", { class: "sitno blijedo" }, "stupaca × redova na stranici")),
        h("div", { class: "z-prekidac z-mreze" },
          h("button", { type: "button", class: `z-tocno${raspored === "auto" ? " on" : ""}`, onclick: () => postavi("auto") }, "Prema broju slika"),
          ...MREZE_LISTICA.map((k) => h("button", { type: "button", class: `z-tocno${raspored === k ? " on" : ""}`, onclick: () => postavi(k) }, k.replace("x", " × "))),
          h("span", { class: `z-mreza-vlastita${vlastita ? " on" : ""}` },
            broj(mc, MREZA_MAX.stupaca, "Stupaca", (n) => postavi(`${n}x${mr}`)), "×",
            broj(mr, MREZA_MAX.redova, "Redova", (n) => postavi(`${mc}x${n}`)),
            vlastita ? null : h("button", { type: "button", class: "z-tocno", onclick: () => postavi(`${mc}x${mr}`) }, "Primijeni"))),
        h("p", { class: "sitno blijedo" }, raspored === "auto"
          ? `Manje slika, veće slike. Sad ${pune} ${pune === 1 ? "slika" : pune < 5 ? "slike" : "slika"}: ${r.stupaca} × ${r.redova}, slika oko ${Math.floor(r.s / 10)} cm.${pune > LISTIC_PO_STRANICI ? ` Na stranicu stane ${LISTIC_PO_STRANICI}, ostale idu na sljedeću.` : ""}`
          : `${stranica} ${stranica === 1 ? "slika" : stranica % 10 >= 2 && stranica % 10 <= 4 && (stranica < 12 || stranica > 14) ? "slike" : "slika"} na stranici, oko ${Math.floor(r.s / 10)} cm.${pune > stranica ? ` Ima ih ${pune}, pa listić ima ${Math.ceil(pune / stranica)} ${Math.ceil(pune / stranica) < 5 ? "stranice" : "stranica"}.` : ""}`)),
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

  /**
   * A4 bez rubova i zaglavlja (mm), za raspored listića u HTML ispisu; ostale stranice nemaju zaglavlje pa su više (kao PDF).
   * Bez okvira 180 × 222 (prva) i 180 × 255; okvir (ako se ispisuje) smanjuje prostor kao u PDF-u.
   */
  const prostorListica = (prva: boolean): [number, number] => {
    const o = podrucjeOkvira(okvirZaIspis());
    return [o.D - o.L, o.dno - o.vrh - (prva ? 41 : 8)];
  };
  /** Mreža listića; `dio` = kartice jedne A4 stranice, `prva` = stranica sa zaglavljem. Veličina i položaj kao u PDF-u (ispis-pdf.ts). */
  function listicMreza(s: Listic, a4 = false, dio?: Listic["kartice"], prva = true) {
    const pune = s.kartice.filter((k) => k.rijec_id || k.tekst);
    const kartice = dio ?? pune;
    const tekst = pune.some((k) => k.tekst) ? 9 : 0;
    // Na papiru: mreža i veličina iz rasporedListica za kartice te stranice (isto kao PDF).
    const r = rasporedListica(Math.min(kartice.length, poStraniciListica(s.raspored)), s.raspored, ...prostorListica(!a4 || prva), 7, tekst);
    // PDF: „prema broju slika” je mreža okomito centrirana, inače redovi raspoređeni po cijeloj visini.
    const okomito = s.raspored === "auto" ? "align-content:center" : `grid-template-rows:repeat(${r.redova},minmax(0,1fr));align-items:start`;
    const stil = a4 ? `grid-template-columns:repeat(${r.stupaca},${Math.floor(r.s)}mm);justify-content:center;flex:1;${okomito}${prva ? "" : ";margin-top:8mm"}` : s.raspored === "auto" && pune.length <= 6 ? `grid-template-columns:repeat(${r.stupaca},minmax(0,${pune.length <= 2 ? 340 : 240}px));justify-content:center` : undefined;
    return h("div", { class: "z-listic", style: stil }, ...kartice.map((k) =>
      h("figure", {}, slika(k.rijec_id, "", false), h("figcaption", {}, k.tekst))));
  }

  // ---------- Pogled: Ispis (A4) ----------

  const uputaIspisa = () => (vrsta === "scena" ? `${uputa} ${VRSTE.scena.ispis}.` : uputa);
  /**
   * Stranice kao u PDF-u (pdf/model.ts `dokumentZadatka`): indeksi stavki po A4 stranici i veličina slike.
   * Dok se model ne učita, sve je na jednoj stranici.
   */
  function straniceIspisa(): { indeksi: number[] | null; velicina?: number }[] {
    if (!model) return [{ indeksi: null }];
    return model.dokumentZadatka({ vrsta, naslov, uputa: uputaIspisa(), sadrzaj, okvir }, p.rijeci, sRijecima, pozadine).stranice
      .map((x) => ({ indeksi: x.indeksi ?? [], velicina: x.velicina }));
  }
  const izbor = <T>(a: T[], ind: number[] | null) => (ind ? ind.map((i) => a[i]).filter((x) => x !== undefined) : a);
  const mm = (v: number | undefined) => (v && v > 0 ? `${Math.floor(v * 10) / 10}mm` : "");

  /** Tijelo jedne A4 stranice: samo stavke s te stranice. */
  function tijeloIspisa(ind: number[] | null, velicina?: number): HTMLElement {
    if (vrsta === "odabir") {
      return h("div", { class: "a4-odabir" }, ...izbor((sadrzaj as Odabir).stavke, ind).map((x) => h("div", { class: "a4-red" },
        h("div", { class: "a4-zadana" }, slika(x.zadana)), h("div", { class: "a4-strelica" }),
        h("div", { class: "a4-ladica" }, ...x.ponudeno.map((pid) => h("div", { class: "a4-izbor" }, slika(pid)))))));
    }
    if (vrsta === "uljez") {
      return h("div", { class: "a4-uljez" }, ...izbor((sadrzaj as Uljez).stavke, ind).map((x) => h("div", { class: "a4-red" },
        ...x.slike.map((pid) => h("div", { class: "a4-izbor" }, slika(pid))))));
    }
    if (vrsta === "percepcija") {
      return h("div", { class: "a4-uljez a4-percepcija" }, ...izbor((sadrzaj as Percepcija).stavke, ind).map((x) => h("div", { class: "a4-red", style: `--n:${x.polja.length}` },
        ...x.polja.map((p) => h("div", { class: "a4-izbor" }, slika(p.rijec_id, "", false, p.izmjena))))));
    }
    if (vrsta === "prvi_glas") {
      // PDF ima krug po stranici i krug bez slova preskače.
      const krugovi = ind ? izbor((sadrzaj as PrviGlas).krugovi, ind) : (sadrzaj as PrviGlas).krugovi.filter((k) => k.slovo);
      return h("div", { class: "a4-prvi-glas" }, ...krugovi.map((k) => h("section", { class: "a4-krug" },
        h("div", { class: "a4-slovo" }, k.slovo ?? "?"),
        h("div", { class: "a4-krug-slike", style: `--stupaca:${k.slike.filter((x) => x !== null).length > 12 ? 5 : 4};${velicina ? `--s:${mm(velicina)}` : ""}` },
          ...k.slike.filter((x) => x !== null).map((id) => h("div", { class: "a4-izbor" }, slika(id, "", false)))))));
    }
    if (vrsta === "slogovi") {
      const s = sadrzaj as Slogovi;
      const slike = ind ? izbor(s.slike, ind) : s.slike.filter((x) => x.rijec_id !== null);
      return h("div", { class: `a4-slogovi ${s.nacin}`, style: velicina ? `--s:${mm(velicina)}` : undefined },
        s.nacin === "duljina" ? h("div", { class: "a4-legenda" }, ...(["duga", "kratka"] as const).map((k) => h("span", { style: `--b:${BOJE_DULJINE[k].boja}` }, h("i", { class: "a4-krug-boje" }), BOJE_DULJINE[k].naziv))) : null,
        h("div", { class: "a4-slogovi-mreza" }, ...slike.map((x) => h("div", { class: "a4-izbor" }, slika(x.rijec_id, "", sRijecima),
          s.nacin !== "duljina" ? kruzici(s.krugova, 0, "a4-krugovi") : null))));
    }
    if (vrsta === "povezivanje") {
      // Stranica je zaseban zadatak: desno samo parovi s te stranice, u promiješanom redoslijedu.
      const s = sadrzaj as Povezivanje;
      const parovi = ind ?? s.parovi.map((_, i) => i);
      return h("div", { class: "a4-povezi", style: velicina ? `--s:${mm(velicina)}` : undefined },
        h("div", { class: "a4-stupac" }, ...parovi.map((i) => h("div", { class: "a4-par" }, slika(s.parovi[i].lijevo), h("i", { class: "a4-tocka" })))),
        h("div", { class: "a4-stupac" }, ...s.desno_redoslijed.filter((i) => parovi.includes(i)).map((pi) => h("div", { class: "a4-par" }, h("i", { class: "a4-tocka" }), slika(s.parovi[pi].desno)))));
    }
    const s = sadrzaj as Scena;
    const poz = slikaZa(pozadina(s.pozadina_id), "uspravno");
    return h("div", { class: "a4-scena" },
      poz ? h("img", { class: "a4-pozadina", src: poz.slika.url, alt: "" }) : h("div", { class: "z-slika prazna a4-pozadina" }, h("span", {}, "pozadina")),
      h("div", { class: "a4-scena-gumbi" }, ...vidljiviGumbi(s).map((g) => h("div", { class: "a4-izbor" }, slika(g.rijec_id, "", true)))));
  }

  function ispis(): HTMLElement {
    if (vrsta === "listic") {
      // Listić po stranicama kao PDF: na stranicu stane koliko daje mreža, zaglavlje samo na prvoj.
      const l = sadrzaj as Listic;
      const pune = l.kartice.filter((k) => k.rijec_id || k.tekst);
      const n = poStraniciListica(l.raspored);
      const dijelovi = pune.length ? Array.from({ length: Math.ceil(pune.length / n) }, (_, i) => pune.slice(i * n, i * n + n)) : [[]];
      return h("div", { class: "a4-okvir" }, ...dijelovi.map((dio, i) => h("article", a4Atributi(),
        okvirSloj(),
        i === 0 ? zaglavljeA4() : null,
        listicMreza(l, true, dio, i === 0),
        h("footer", {}, dijelovi.length > 1 ? `logomedo.com · ${i + 1}/${dijelovi.length}` : "logomedo.com"))));
    }
    // Ostale vrste: iste stranice kao PDF, svaka A4 fiksne visine (vidi se gdje je papir presječen).
    const stranice = straniceIspisa();
    return h("div", { class: "a4-okvir" }, ...stranice.map((st, i) => h("article", a4Atributi(true),
      okvirSloj(),
      i === 0 ? zaglavljeA4() : null,
      tijeloIspisa(st.indeksi, st.velicina),
      h("footer", {}, stranice.length > 1 ? `logomedo.com · ${i + 1}/${stranice.length}` : "logomedo.com"))));
  }

  /** Okvir na papiru samo kad ne smanjuje slike (isto pravilo kao PDF, `okvirDopusten`). */
  function okvirZaIspis(): Okvir | null { return imaOkvir(okvir) && okvirStanje.dopusten ? okvir : null; }
  /** Stranica s okvirom: unutarnji prostor kao u PDF-u (okviri.ts `podrucje`). */
  function a4Atributi(stranica = false) {
    const o = okvirZaIspis();
    const kl = `a4 a4-${vrsta}${stranica ? " a4-stranica" : ""}`;
    if (!o) return { class: kl };
    const g = podrucjeOkvira(o);
    return { class: `${kl} a4-s-okvirom${g.sredina ? " a4-sredina" : ""}`, style: `padding:${g.vrh}mm ${A4_MM.w - g.D}mm ${A4_MM.h - g.dno - 6}mm ${g.L}mm` };
  }
  function okvirSloj() {
    const svg = okvirSvg(okvirZaIspis());
    if (!svg) return null;
    const d = h("div", { class: "a4-okvir-pozadina" });
    d.innerHTML = svg;
    return d;
  }

  function zaglavljeA4() {
    return h("header", {}, h("h1", {}, naslov || VRSTE[vrsta].naziv), uputa ? h("p", {}, uputa) : null,
      h("div", { class: "a4-ime" }, "Ime: ", h("span", {})));
  }

  async function preuzmiPdf(e: Event) {
    const gumb = e.currentTarget as HTMLButtonElement;
    const tekst = gumb.textContent;
    gumb.disabled = true; gumb.textContent = "Pripremam PDF…";
    try {
      const [{ dokumentZadatka }, pdf] = await Promise.all([import("../pdf/model.ts"), import("../pdf/preglednik.ts")]);
      const dok = dokumentZadatka({ vrsta, naslov, uputa: uputaIspisa(), sadrzaj, okvir }, p.rijeci, sRijecima, pozadine);
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
      body: JSON.stringify({ naslov, uputa, podrucje_id: podrucje, stil, sadrzaj, okvir }),
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
  // ---------- Okvir radnog listića (okviri.ts) ----------
  // Pravilo kvalitete je u pdf/model.ts (učitava se dinamički, kao PDF); dok se ne učita, okvir je dopušten.
  let okvirStanje = { dopusten: true, bez: 0, s: 0 };
  let obavijestOkvira = "";
  let model: typeof import("../pdf/model.ts") | null = null;
  const ucitajModel = () => import("../pdf/model.ts").then((m) => { model = m; return m; });
  /** Ocjena okvira za trenutni sadržaj (sinkrono kad je model učitan). */
  function ocijeniOkvir(o: Okvir) {
    if (!model || !imaOkvir(o)) return { dopusten: true, bez: 0, s: 0 };
    return model.ocjenaOkvira({ vrsta, naslov, uputa: uputaIspisa(), sadrzaj }, p.rijeci, sRijecima, pozadine, o);
  }
  const cm = (mm: number) => `${(mm / 10).toFixed(1).replace(".", ",")} cm`;
  function zastoNe(o: Okvir) {
    const r = ocijeniOkvir(o);
    if (r.dopusten) return "";
    return r.s <= 0
      ? "S okvirom zadatak ne stane na stranicu, pa se za ovaj zadatak taj okvir ne može odabrati."
      : `S tim okvirom slike bi bile ${cm(r.s)} umjesto ${cm(r.bez)}, a manje od ${cm(model!.NAJMANJA_SLIKA)} su na papiru presitne. Za ovaj zadatak taj okvir se ne može odabrati: smanji broj slika, odaberi okvir bez ukrasa u kutovima ili bez okvira.`;
  }
  /** Novi okvir iz ploče: nedopušten se ne prihvaća, nego iskoči obavijest. */
  function postaviOkvir(o: Okvir) {
    const zasto = zastoNe(o);
    if (zasto) { obavijestOkvira = zasto; osvjeziPlocu(); return; }
    okvir = o; obavijestOkvira = ""; oznaci(); osvjeziOkvir();
  }
  function osvjeziOkvir() { okvirStanje = ocijeniOkvir(okvir); if (pogled === "uredi") osvjeziPlocu(); else osvjezi(); }
  /** Ponovno crtanje ne smije skočiti na vrh: pamti se pomak stranice i ploče s opcijama. */
  function bezSkoka(crtaj: () => void) {
    const ploha = () => document.querySelector<HTMLElement>(".z-okvir-pogled > .ploha, .z-ploca");
    const y = scrollY, p = ploha()?.scrollTop ?? 0;
    crtaj();
    const nova = ploha();
    if (nova) nova.scrollTop = p;
    scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
  }
  ucitajModel().then(() => osvjeziOkvir()).catch(() => {});

  /** Kratki nazivi rubova za pločice (puni su u RUBOVI). */
  const KRATKO_RUB: Record<Okvir["rub"], string> = { bez: "Bez ruba", "kocke-crvene": "Crvene kockice", "kocke-zelene": "Zelene kockice", "pruge-zelene": "Zelene pruge", "prugice-crvene": "Crvene prugice" };
  /** Mala A4 stranica s okvirom (isti SVG kao Ispis i PDF). */
  function minijatura(o: Okvir, klasa = "") {
    const d = h("span", { class: `z-mini ${klasa}`.trim() });
    d.innerHTML = okvirSvg(o);
    return d;
  }

  function okvirPloca(): HTMLElement {
    const gotov = GOTOVI.find((g) => isti(g.okvir, okvir))?.kod ?? (imaOkvir(okvir) ? "vlastiti" : "bez");
    const s = (izmjena: Partial<Okvir>) => normalizirajOkvir({ ...okvir, ...izmjena, kutovi: [...(izmjena.kutovi ?? okvir.kutovi)] });
    /** Pločica izbora: sličica + naziv. Nedopušten izbor je blijed, a klik pokaže zašto (postaviOkvir). */
    const plocica = (o: Okvir, sadrzaj: Node, naziv: string, odabrano: boolean, klasa = "") => {
      const zasto = odabrano ? "" : zastoNe(o);
      return h("button", { type: "button", class: `z-plocica ${klasa}${odabrano ? " on" : ""}${zasto ? " ne" : ""}`, title: zasto ? `${naziv}: ne može (klikni za razlog)` : naziv,
        "aria-pressed": odabrano ? "true" : "false", onclick: () => postaviOkvir(o) }, sadrzaj, h("span", {}, naziv));
    };
    const slika = (url: string) => h("img", { src: url, alt: "", loading: "lazy" });
    const zaKut = (i: number, u: Kutovi[number]) => { const kutovi = [...okvir.kutovi] as Kutovi; kutovi[i] = u; return s({ kutovi }); };
    return plocaEl = h("div", { class: "ploha z-okvir" },
      h("h3", {}, "Okvir za ispis", imaOkvir(okvir) ? h("span", { class: "blijedo" }, ` · ${GOTOVI.find((g) => g.kod === gotov)?.naziv ?? "vlastiti"}`) : null),
      obavijestOkvira ? h("div", { class: "z-obavijest", role: "alert" }, h("b", {}, "Okvir se ne može odabrati"), h("p", {}, obavijestOkvira),
        h("button", { type: "button", class: "gumb mali", onclick: () => { obavijestOkvira = ""; osvjeziPlocu(); } }, "U redu")) : null,
      imaOkvir(okvir) && !okvirStanje.dopusten ? h("p", { class: "z-obavijest" }, "Uz sadašnji sadržaj okvir bi smanjio slike, pa se ne ispisuje (ni u PDF-u). ", zastoNe(okvir)) : null,

      h("label", {}, "Gotovi okvir"),
      h("div", { class: "z-plocice stranice" },
        plocica(normalizirajOkvir(null), minijatura(normalizirajOkvir(null)), "Bez okvira", gotov === "bez"),
        ...GOTOVI.map((g) => plocica(structuredClone(g.okvir), minijatura(g.okvir), g.naziv, gotov === g.kod))),
      h("label", {}, "Rub"),
      h("div", { class: "z-plocice rubovi" }, ...(Object.keys(RUBOVI) as Okvir["rub"][]).map((r) =>
        plocica(s({ rub: r }), minijatura({ rub: r, masna: null, kutovi: [null, null, null, null] }), KRATKO_RUB[r], okvir.rub === r))),
      h("label", {}, "Mašna gore"),
      h("div", { class: "z-plocice ukrasi" },
        plocica(s({ masna: null }), h("i", { class: "z-prazno" }, "—"), "Bez mašne", !okvir.masna),
        ...(Object.keys(MASNE) as NonNullable<Okvir["masna"]>[]).map((m) => plocica(s({ masna: m }), slika(urlUkrasa(`masna-${m}`)), MASNE[m], okvir.masna === m))),
      okvir.masna ? h("label", { class: "z-kvacica", title: zastoNe(normalizirajOkvir({ ...okvir, velikaMasna: !okvir.velikaMasna })) || undefined },
        h("input", { type: "checkbox", checked: !!okvir.velikaMasna, onchange: () => postaviOkvir(normalizirajOkvir({ ...okvir, velikaMasna: !okvir.velikaMasna })) }),
        " Velika mašna (zadatak počinje niže)") : null,
      h("label", {}, "Ukrasi u kutovima"),
      ...KUTOVI.map((kut, i) => h("div", { class: "z-izbor-kuta" },
        h("b", {}, kut),
        h("div", { class: "z-plocice ukrasi" },
          plocica(zaKut(i, null), h("i", { class: "z-prazno" }, "—"), "Bez ukrasa", !okvir.kutovi[i]),
          ...(Object.keys(UKRASI) as NonNullable<Kutovi[number]>[]).map((u) => plocica(zaKut(i, u), slika(urlUkrasa(u)), UKRASI[u], okvir.kutovi[i] === u))))),
      h("p", { class: "sitno blijedo" }, "Okvir je samo na papiru (PDF i Ispis). Ukrasi u gornjim kutovima i mašna stavljaju naslov u sredinu. Blijedi izbori ne mogu uz ovaj zadatak (slike bi bile premale)."));
  }

  function osvjeziPlocu() { const stara = plocaEl; if (stara) bezSkoka(() => (stara as any).replaceWith(pogled === "okvir" ? okvirPloca() : ploca())); }

  function ploca(): HTMLElement {
    const upozorenja = upozorenjaSvih();
    const granice = BROJ_STAVKI[vrsta];
    const poljeBroja = h("input", { type: "number", min: granice?.min ?? 1, max: granice?.max ?? 12, value: postavke.stavki, oninput: (e: Event) => (postavke.stavki = brojStavki(vrsta, (e.target as HTMLInputElement).value)) });
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
      h("div", { class: "ploha z-okvir-sazetak" },
        h("b", {}, "Okvir za ispis"),
        h("div", { class: "z-okvir-sazetak-red" }, minijatura(okvir),
          h("span", {}, imaOkvir(okvir) ? GOTOVI.find((g) => isti(g.okvir, okvir))?.naziv ?? "Vlastiti" : "Bez okvira",
            imaOkvir(okvir) && !okvirStanje.dopusten ? h("small", { class: "z-greska-tekst" }, " (ne ispisuje se: slike bi bile premale)") : null)),
        h("button", { type: "button", class: "gumb mali", onclick: () => { pogled = "okvir"; history.replaceState(null, "", "#okvir"); osvjezi(); } }, "Odaberi okvir")),
      upozorenja.length
        ? h("div", { class: "ploha z-upozorenja" }, h("b", {}, `Upozorenja (${upozorenja.length})`),
          h("ul", {}, ...upozorenja.map((u) => h("li", {}, h("span", { class: "blijedo" }, `${u.gdje}: `), u.poruka))))
        : h("div", { class: "ploha z-upozorenja ok" }, "✓ Zadatak je ispravan."),
      VRSTE[vrsta].odnos || vrsta === "listic" || vrsta === "percepcija" || vrsta === "prvi_glas" || vrsta === "slogovi" ? h("details", { class: "ploha z-slozi" },
        h("summary", {}, "Složi automatski iz kataloga"),
        h("label", {}, `${granice?.naziv ?? "Broj redova"} (do ${granice?.max ?? 12})`), poljeBroja,
        vrsta === "slogovi" ? h("p", { class: "sitno blijedo" }, (sadrzaj as Slogovi).nacin === "duljina" ? "Pola kratkih (1–2 sloga), pola dugačkih (3 i više) riječi sa slikom." : (sadrzaj as Slogovi).nacin === "glasovi" ? "Podjednako riječi od 3 do 7 glasova; krugova koliko treba najduža." : "Podjednako riječi od 1 sloga do broja krugova; krugova koliko treba najduža.") : null,
        vrsta === "percepcija" ? h("p", { class: "sitno blijedo" }, "Nasumične riječi sa slikom, po jedna u redu.") : null,
        vrsta === "prvi_glas" ? h("p", { class: "sitno blijedo" }, `Nasumična slova s kola, svako s ${SLIKA_MIN} slika: 3–5 počinje tim glasom, ostale ne.`) : null,
        vrsta === "percepcija" || vrsta === "prvi_glas" || vrsta === "slogovi" ? null : h("label", { class: "z-kvacica" }, h("input", { type: "checkbox", checked: postavke.maxSlogova === 3, onchange: (e: Event) => (postavke.maxSlogova = (e.target as HTMLInputElement).checked ? 3 : 0) }), " Najviše 3 sloga"),
        vrsta === "percepcija" || vrsta === "prvi_glas" || vrsta === "slogovi" ? null : h("label", { class: "z-kvacica" }, h("input", { type: "checkbox", checked: postavke.samoSaSlikom, onchange: (e: Event) => (postavke.samoSaSlikom = (e.target as HTMLInputElement).checked) }), " Samo riječi sa slikom"),
        h("button", { type: "button", class: "gumb", onclick: () => {
          if (rijeciU(vrsta, sadrzaj).length && !confirm("Zamijeniti sadržaj novim prijedlogom?")) return;
          const prije = sadrzaj;
          const napisane = ulogeNapisano(vrsta, prije).filter((u) => ulogaNapisana(u, jeZnakId)).map((u) => u.kljuc);
          const pg = poGlasovima();
          if (vrsta === "slogovi") sadrzaj = slozSlogove((prije as Slogovi).nacin, zaGenerator(p.rijeci), postavke.stavki, (prije as Slogovi).krugova);
          else if (pg) {
            // Po glasovima zadatka: bez isključenih glasova, red po red redom po odabranim glasovima.
            const ciljevi = ciljeviGlasova(pg).map((c) => (r: RijecZadatka) => c(sGlasovima(r)));
            const izvor = zaGenerator(p.rijeci).filter((r) => odgovara(sGlasovima(r), { glasovi: [], pozicija: "", bez: pg.bez }));
            sadrzaj = slozi(vrsta, izvor, { ...postavke, nacin: odnosOd(prije), ciljevi: ciljevi.length ? ciljevi : undefined });
            (sadrzaj as Odabir).po_glasovima = pg;
          } else sadrzaj = slozi(vrsta, zaGenerator(p.rijeci), { ...postavke, nacin: VRSTE[vrsta].odnos ? odnosOd(prije) : undefined });
          // Napisani stupci (zadane, desni stupac…) ostaju napisani i u novom prijedlogu.
          for (const u of ulogeNapisano(vrsta, sadrzaj)) if (napisane.includes(u.kljuc)) postaviUlogu(u, true, jeZnakId);
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
          oznaci(); osvjezi();
        } }, "Složi")) : null);
  }

  const kartice = h("nav", { class: "z-kartice" });
  const tijelo = h("div", { class: "z-tijelo" });
  dodaj(korijen, kartice, tijelo);

  /** Pregled za dijete u novoj kartici: POST trenutnog nacrta (nespremljene izmjene se vide, ništa se ne sprema). */
  function dijeteRjesava() {
    const f = h("form", { method: "post", action: `/admin/zadaci/${z.id}/dijete`, target: "_blank", hidden: true },
      ...([["sadrzaj", JSON.stringify(sadrzaj)], ["naslov", naslov], ["uputa", uputa]] as const).map(([name, value]) => h("input", { type: "hidden", name, value })));
    dodaj(globalThis.document.body, f); f.submit(); f.remove();
  }

  // ---------- Zoom lista (Okvir, Ispis) ----------
  // null = „stane”: list (210 mm ≈ 794 px) se smanji na širinu svog stupca; inače zadano mjerilo.
  let mjerilo: number | null = null, trenutno = 1;
  const zoomTekst = h("span", {}, "Stane");
  function primijeniMjerilo() {
    const okvirEl = tijelo.querySelector<HTMLElement>(".a4-okvir");
    if (!okvirEl) return;
    const stane = Math.min(1, (okvirEl.clientWidth - 56) / 794);
    trenutno = mjerilo ?? Math.max(0.25, stane);
    okvirEl.querySelectorAll<HTMLElement>(".a4").forEach((a) => (a.style.zoom = String(trenutno)));
    zoomTekst.textContent = `${mjerilo === null ? "Stane · " : ""}${Math.round(trenutno * 100)} %`;
  }
  function zoom(d: number) { mjerilo = Math.min(2, Math.max(0.25, Math.round((trenutno + d) * 10) / 10)); primijeniMjerilo(); }
  addEventListener("resize", () => { if (pogled !== "uredi") primijeniMjerilo(); });

  function osvjezi() {
    zamijeni(kartice, 
      ...([["uredi", "Uredi"], ["okvir", "Okvir"], ["ispis", "Ispis"]] as const).map(([k, t]) =>
        h("button", { type: "button", class: `z-kartica${pogled === k ? " on" : ""}`, onclick: () => { pogled = k; history.replaceState(null, "", `#${k}`); osvjezi(); } }, t)),
      h("button", { type: "button", class: "z-kartica", title: "Otvara se u novoj kartici, s trenutnim (i nespremljenim) izmjenama", onclick: dijeteRjesava }, "Dijete rješava ↗"),
      h("span", { class: "z-razmak" }),
      pogled !== "uredi" ? h("label", { class: "z-kvacica" }, h("input", { type: "checkbox", checked: sRijecima, onchange: (e: Event) => { sRijecima = (e.target as HTMLInputElement).checked; osvjezi(); } }), " Riječi ispod slika") : null,
      pogled !== "uredi" ? h("span", { class: "z-zoom", role: "group", "aria-label": "Veličina lista" },
        h("button", { type: "button", class: "gumb mali", title: "Smanji list", onclick: () => zoom(-0.1) }, "−"),
        h("button", { type: "button", class: "gumb mali z-zoom-posto", title: "Klikni: list stane u širinu", onclick: () => { mjerilo = null; primijeniMjerilo(); } }, zoomTekst),
        h("button", { type: "button", class: "gumb mali", title: "Povećaj list", onclick: () => zoom(0.1) }, "+")) : null,
      pogled === "ispis" ? h("button", { type: "button", class: "gumb glavni mali", onclick: preuzmiPdf }, "Preuzmi PDF") : null,
      pogled !== "uredi" ? h("button", { type: "button", class: "gumb mali", onclick: () => document.documentElement.requestFullscreen?.() }, "Cijeli zaslon") : null,
      stanjeEl, spremiGumb,
    );
    bezSkoka(() => {
      if (pogled === "uredi") zamijeni(tijelo, h("div", { class: "z-raspored" }, uredi(), ploca()));
      // Okvir: lijevo prava stranica (kao Ispis), desno izbor sa sličicama; svi kutovi su stalno otvoreni.
      else if (pogled === "okvir") zamijeni(tijelo, h("div", { class: "z-okvir-pogled" }, ispis(), okvirPloca()));
      else zamijeni(tijelo, ispis());
      // Mjerilo odmah (prije vraćanja pomaka), da visina lista ne skoči nakon crtanja.
      if (pogled !== "uredi") primijeniMjerilo();
    });
  }
  osvjezi();
}

// Za konzolu i testiranje ključa rime iz preglednika.
(globalThis as any).logomedoRima = { izvediRimu, brojSlogova };
