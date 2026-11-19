// Priprema produkcijskog dumpa (`wrangler d1 export --no-schema`) za import u staging D1
// (scripts/staging-osvjezi.sh, docs/staging.md). Ne koristi se u Workeru.
//
// 1. Export ide redom nastanka tablica, a D1 import se commita u dijelovima, pa INSERT u dijete
//    prije roditelja (npr. stilovi → prompt_verzije) padne na FK. Naredbe se slože roditelj → dijete.
// 2. Samoreferenca (slike.zamjenjuje, podrucja…) može pokazivati na kasniji redak: INSERT s NULL,
//    prava vrijednost UPDATE-om na kraju dumpa.
// 3. Zaštita: strani ključ prema tablici koja ne postoji ruši svaki INSERT, pa ta vrijednost postaje
//    NULL (i javlja se na stderr). Na D1 se to ne događa (RENAME u migraciji 0033 ažurira
//    REFERENCES), ali lokalni sqlite3 s istim migracijama ostavi `REFERENCES aktivnost_nova`.
//
// CLI: node src/lib/staging-dump.ts brisanje|drop <shema.json>   → DELETE/DROP naredbe, dijete → roditelj
//      node src/lib/staging-dump.ts slozi <shema.json> <dump.sql> → složeni dump na stdout, izvještaj na stderr
// shema.json je izlaz `wrangler d1 execute --json --command "SELECT name, sql FROM sqlite_master …"`.

export interface Tablica { name: string; sql: string | null }

const REF = /REFERENCES\s+"?(\w+)"?/gi;

function roditelji(t: Tablica): Set<string> {
  return new Set([...(t.sql ?? "").matchAll(REF)].map((m) => m[1]).filter((x) => x !== t.name));
}

/** Tablice redom roditelj → dijete (ciklusi ne ruše, samo se prekinu). */
export function redoslijed(tablice: Tablica[]): string[] {
  const rod = new Map(tablice.map((t) => [t.name, roditelji(t)]));
  const red: string[] = [], vidjeno = new Set<string>();
  const posjeti = (n: string) => {
    if (vidjeno.has(n)) return;
    vidjeno.add(n);
    for (const r of rod.get(n) ?? []) if (rod.has(r)) posjeti(r);
    red.push(n);
  };
  for (const t of tablice) posjeti(t.name);
  return red;
}

/** Stupci s REFERENCES iz CREATE TABLE (i stupci dodani s ALTER TABLE, koji su u istom tekstu). */
export function straniKljucevi(t: Tablica): { stupac: string; roditelj: string }[] {
  const sql = t.sql ?? "";
  const tijelo = sql.slice(sql.indexOf("(") + 1, sql.lastIndexOf(")"));
  const out: { stupac: string; roditelj: string }[] = [];
  for (const def of rastavi(tijelo)) {
    const m = def.trim().match(/^"?(\w+)"?\s[\s\S]*?REFERENCES\s+"?(\w+)"?/i);
    if (m && !/^(FOREIGN|PRIMARY|UNIQUE|CHECK|CONSTRAINT)$/i.test(m[1])) out.push({ stupac: m[1], roditelj: m[2] });
  }
  return out;
}

/** Stupci čiji REFERENCES pokazuje na tablicu koje nema: tablica → stupci. */
export function viseciKljucevi(tablice: Tablica[]): Map<string, string[]> {
  const imena = new Set(tablice.map((t) => t.name));
  const out = new Map<string, string[]>();
  for (const t of tablice) {
    const s = straniKljucevi(t).filter((k) => !imena.has(k.roditelj)).map((k) => k.stupac);
    if (s.length) out.set(t.name, s);
  }
  return out;
}

/** Samoreference (npr. slike.zamjenjuje → slike.id): tablica → stupci. */
export function samoreference(tablice: Tablica[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const t of tablice) {
    const s = straniKljucevi(t).filter((k) => k.roditelj === t.name).map((k) => k.stupac);
    if (s.length) out.set(t.name, s);
  }
  return out;
}

/** Rastavi `a, 'b,c', NULL` na vrhu razine (navodnici s '' unutra, zagrade). */
export function rastavi(s: string): string[] {
  const dijelovi: string[] = [];
  let tek = "", uNavodnicima = false, dubina = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (uNavodnicima) {
      tek += c;
      if (c === "'") {
        if (s[i + 1] === "'") { tek += "'"; i++; } else uNavodnicima = false;
      }
    } else if (c === "'") { uNavodnicima = true; tek += c; }
    else if (c === "(") { dubina++; tek += c; }
    else if (c === ")") { dubina--; tek += c; }
    else if (c === "," && dubina === 0) { dijelovi.push(tek); tek = ""; }
    else tek += c;
  }
  dijelovi.push(tek);
  return dijelovi;
}

const INSERT = /^INSERT INTO "([^"]+)" \(([^)]*)\) VALUES\(([\s\S]*)\);$/;

/** Postavi zadane stupce na NULL u jednoj `INSERT INTO "t" ("a","b") VALUES(…);` naredbi. */
export function nuliraj(naredba: string, stupci: string[]): { naredba: string; promijenjeno: boolean; stare: Map<string, string>; id: string | null } {
  const m = naredba.match(INSERT);
  if (!m) return { naredba, promijenjeno: false, stare: new Map(), id: null };
  const imena = m[2].split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
  const vrijednosti = rastavi(m[3]);
  if (vrijednosti.length !== imena.length) throw new Error(`ne mogu rastaviti INSERT u ${m[1]}`);
  let promijenjeno = false;
  const stare = new Map<string, string>();
  for (const s of stupci) {
    const i = imena.indexOf(s);
    if (i >= 0 && vrijednosti[i].trim().toUpperCase() !== "NULL") {
      stare.set(s, vrijednosti[i]);
      vrijednosti[i] = "NULL";
      promijenjeno = true;
    }
  }
  const iId = imena.indexOf("id");
  return {
    naredba: `INSERT INTO "${m[1]}" (${m[2]}) VALUES(${vrijednosti.join(",")});`,
    promijenjeno, stare, id: iId >= 0 ? vrijednosti[iId] : null,
  };
}

/** Naredbe dumpa: nova počinje retkom `INSERT INTO "…"`, `PRAGMA` ili `DELETE FROM`; ostali reci su nastavak (višeredni string). */
export function naredbe(dump: string): { tablica: string | null; tekst: string }[] {
  const out: { tablica: string | null; reci: string[] }[] = [];
  for (const l of dump.split("\n")) {
    const m = l.match(/^INSERT INTO "([^"]+)"/);
    if (m || /^(PRAGMA|DELETE FROM) /.test(l) || out.length === 0) out.push({ tablica: m ? m[1] : null, reci: [l] });
    else out[out.length - 1].reci.push(l);
  }
  return out.map((n) => ({ tablica: n.tablica, tekst: n.reci.join("\n") }));
}

export function slozi(dump: string, tablice: Tablica[]): { dump: string; nulirano: Map<string, number> } {
  const rang = new Map(redoslijed(tablice).map((t, i) => [t, i]));
  const visece = viseciKljucevi(tablice);
  const samo = samoreference(tablice);
  const nulirano = new Map<string, number>();
  const naknadno: string[] = [];
  const r = (t: string | null) => (t === null ? -1 : rang.get(t) ?? rang.size);
  const sve = naredbe(dump).map((n, i) => {
    if (!n.tablica) return { ...n, i };
    let tekst = n.tekst;
    const v = visece.get(n.tablica);
    if (v) {
      const x = nuliraj(tekst, v);
      if (x.promijenjeno) nulirano.set(n.tablica, (nulirano.get(n.tablica) ?? 0) + 1);
      tekst = x.naredba;
    }
    // Samoreferenca može pokazivati na kasniji redak: INSERT s NULL, vrijednost UPDATE-om na kraju.
    const s = samo.get(n.tablica);
    if (s) {
      const x = nuliraj(tekst, s);
      if (x.promijenjeno) {
        if (x.id === null) throw new Error(`samoreferenca u ${n.tablica} bez stupca id`);
        const set = [...x.stare].map(([k, val]) => `"${k}" = ${val}`).join(", ");
        naknadno.push(`UPDATE "${n.tablica}" SET ${set} WHERE "id" = ${x.id};`);
        tekst = x.naredba;
      }
    }
    return { ...n, tekst, i };
  });
  sve.sort((a, b) => r(a.tablica) - r(b.tablica) || a.i - b.i);
  return { dump: [...sve.map((n) => n.tekst), ...naknadno].join("\n"), nulirano };
}

async function cli(argv: string[]) {
  const fs = await import("node:fs");
  const tablice: Tablica[] = JSON.parse(fs.readFileSync(argv[1], "utf8"))[0].results;
  if (argv[0] === "brisanje" || argv[0] === "drop") {
    console.log("PRAGMA defer_foreign_keys = on;");
    for (const t of redoslijed(tablice).reverse()) {
      console.log(argv[0] === "drop" ? `DROP TABLE IF EXISTS "${t}";` : `DELETE FROM "${t}";`);
    }
  } else if (argv[0] === "slozi") {
    const x = slozi(fs.readFileSync(argv[2], "utf8"), tablice);
    process.stdout.write(x.dump);
    for (const [t, n] of x.nulirano) console.error(`visi strani ključ: ${t}, ${n} redaka s NULL (${viseciKljucevi(tablice).get(t)!.join(", ")})`);
  } else {
    throw new Error("upotreba: brisanje <shema.json> | slozi <shema.json> <dump.sql>");
  }
}

if (typeof process !== "undefined" && process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await cli(process.argv.slice(2));
}
