// Dopuni katalog glasovima koji nedostaju (podjele-glasova.ts: 25 suglasnika i 5 samoglasnika), kao „Novi glas”
// (src/pages/admin/api/novi-glas.ts): glas bez kategorije i bez pozicije „skupina”, a sve riječi koje ga imaju
// dobiju ga s pozicijama iz pravopisa (`potvrdeno = 0`, logoped potvrđuje na stranici glasa).
// Samo dodaje (INSERT OR IGNORE); postojeće glasove i veze ne dira.
//
//   node --experimental-strip-types scripts/glasovi-dopuni.ts --local    # ili --remote; bez --izvedi samo ispiše plan
//   node --experimental-strip-types scripts/glasovi-dopuni.ts --remote --izvedi
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pojave, slug } from "../src/lib/fonemi.ts";
import { SVI_GLASOVI } from "../src/lib/podjele-glasova.ts";

const gdje = process.argv.includes("--remote") ? "--remote" : process.argv.includes("--local") ? "--local" : null;
if (!gdje) throw new Error("--local ili --remote");
const izvedi = process.argv.includes("--izvedi");

const upit = <T>(sql: string): T[] =>
  JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "logomedo", gdje, "--json", "--command", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0].results;

const postoje = new Set(upit<{ oznaka: string }>("SELECT oznaka FROM glasovi").map((g) => g.oznaka));
const novi = SVI_GLASOVI.filter((g) => !postoje.has(g));
if (!novi.length) { console.log("Svi glasovi su već u katalogu."); process.exit(0); }
const rijeci = upit<{ id: number; rijec: string }>("SELECT id, rijec FROM rijeci WHERE vrsta = 'rijec'");

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const sql: string[] = [];
for (const g of novi) {
  sql.push(`INSERT OR IGNORE INTO glasovi (oznaka, slug, skupina, skupine, redoslijed) VALUES (${q(g)}, ${q(slug(g))}, NULL, 0, (SELECT COALESCE(MAX(redoslijed), 0) + 1 FROM glasovi));`);
  const veze = rijeci.flatMap((r) => pojave(r.rijec, [g], []).map((p) => `(${r.id}, (SELECT id FROM glasovi WHERE oznaka = ${q(g)}), ${q(p.pozicija)}, 0)`));
  for (let i = 0; i < veze.length; i += 50) sql.push(`INSERT OR IGNORE INTO rijec_glas (rijec_id, glas_id, pozicija, potvrdeno) VALUES ${veze.slice(i, i + 50).join(", ")};`);
  console.log(`${g.padEnd(3)} ${new Set(veze.map((v) => v.split(",")[0])).size} riječi, ${veze.length} veza`);
}
if (!izvedi) { console.log(`\n${sql.length} upita; dodaj --izvedi.`); process.exit(0); }
const f = join(mkdtempSync(join(tmpdir(), "glasovi-")), "dopuni.sql");
writeFileSync(f, sql.join("\n"));
execFileSync("npx", ["wrangler", "d1", "execute", "logomedo", gdje, "--file", f, "-y"], { stdio: "inherit" });
console.log(`Dodano: ${novi.join(", ")}`);
