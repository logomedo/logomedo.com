// D1 za testove: podskup D1Database nad node:sqlite (`:memory:`), s primijenjenim svim
// migrations/*.sql redom kao wrangler (puno ime datoteke, pa 0030_okvir… prije 0030_zvuk…).
// Pokriva prepare/bind/first/all/run/raw, batch (transakcija) i exec; ostalo baca.
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

const MAPA_MIGRACIJA = new URL("../../../migrations/", import.meta.url);

/** Imena migracija redom kojim ih wrangler primjenjuje. */
export function migracije(): string[] {
  return readdirSync(MAPA_MIGRACIJA).filter((f) => f.endsWith(".sql")).sort();
}

type Vrijednost = null | number | bigint | string | Uint8Array;

/** D1 baca na `undefined`; boolean pretvara u 1/0. */
function pretvori(v: unknown, i: number): Vrijednost {
  if (v === undefined) throw new Error(`D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined' (parametar ${i + 1})`);
  if (v === null || typeof v === "number" || typeof v === "bigint" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  throw new Error(`D1_TYPE_ERROR: Type '${typeof v}' not supported (parametar ${i + 1})`);
}

class Upit {
  private readonly db: DatabaseSync;
  readonly sql: string;
  readonly parametri: Vrijednost[];
  constructor(db: DatabaseSync, sql: string, parametri: Vrijednost[] = []) {
    this.db = db;
    this.sql = sql;
    this.parametri = parametri;
  }

  bind(...args: unknown[]): Upit {
    return new Upit(this.db, this.sql, args.map(pretvori));
  }

  /** Izvrši i vrati retke + meta; radi i za INSERT/UPDATE … RETURNING. */
  izvrsi(): { results: Record<string, unknown>[]; meta: Record<string, number> } {
    const prije = this.ukupnoPromjena();
    const pocetak = performance.now();
    const results = this.db.prepare(this.sql).all(...this.parametri) as Record<string, unknown>[];
    const zadnji = this.db.prepare("SELECT last_insert_rowid() AS r").get() as { r: number };
    const changes = this.ukupnoPromjena() - prije;
    return {
      results: results.map((r) => ({ ...r })),
      meta: { changes, last_row_id: zadnji.r, rows_read: results.length, rows_written: changes, duration: performance.now() - pocetak, changed_db: changes > 0 ? 1 : 0 } as Record<string, number>,
    };
  }

  private ukupnoPromjena(): number {
    return (this.db.prepare("SELECT total_changes() AS c").get() as { c: number }).c;
  }

  async first<T = Record<string, unknown>>(stupac?: string): Promise<T | null> {
    const red = this.izvrsi().results[0];
    if (!red) return null;
    if (stupac === undefined) return red as T;
    if (!(stupac in red)) throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${stupac})`);
    return red[stupac] as T;
  }

  async all<T = Record<string, unknown>>() {
    const { results, meta } = this.izvrsi();
    return { results: results as T[], success: true as const, meta };
  }

  async run<T = Record<string, unknown>>() {
    return this.all<T>();
  }

  async raw<T = unknown[]>(opcije?: { columnNames?: boolean }): Promise<T[]> {
    const st = this.db.prepare(this.sql);
    st.setReturnArrays(true);
    const redovi = st.all(...this.parametri) as unknown as T[];
    if (!opcije?.columnNames) return redovi;
    return [st.columns().map((c) => c.name) as T, ...redovi];
  }
}

/** SQL jedne migracije (npr. za test koji je primijeni nad bazom stanja prije nje). */
export function procitajMigraciju(ime: string): string {
  return readFileSync(new URL(ime, MAPA_MIGRACIJA), "utf8");
}

/**
 * `doMigracije: "0031"` primijeni samo migracije čiji broj nije veći (uključivo sve s tim
 * brojem); ostatak test pušta kroz `db.exec(procitajMigraciju(…))`.
 */
export function napraviD1(opcije: { doMigracije?: string } = {}): D1Database {
  const db = new DatabaseSync(":memory:");
  const granica = opcije.doMigracije;
  for (const ime of migracije()) {
    if (granica !== undefined && ime.slice(0, granica.length) > granica) continue;
    try {
      db.exec(procitajMigraciju(ime));
    } catch (e) {
      throw new Error(`migracija ${ime} ne prolazi u node:sqlite: ${(e as Error).message}`);
    }
  }
  const d1 = {
    prepare: (sql: string) => new Upit(db, sql),
    async batch(upiti: Upit[]) {
      db.exec("BEGIN");
      try {
        const rez = upiti.map((u) => {
          const { results, meta } = u.izvrsi();
          return { results, success: true as const, meta };
        });
        db.exec("COMMIT");
        return rez;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async exec(sql: string) {
      const pocetak = performance.now();
      db.exec(sql);
      return { count: sql.split(";").filter((s) => s.trim()).length, duration: performance.now() - pocetak };
    },
    dump() {
      throw new Error("dump nije podržan u test D1");
    },
    withSession() {
      return d1;
    },
  };
  return d1 as unknown as D1Database;
}
