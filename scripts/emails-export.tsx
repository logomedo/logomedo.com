// Izvoz React Email predložaka (emails/*.tsx) u src/lib/emails/generirano.ts: HTML i tekst s placeholderima
// {{ime}}, koje src/lib/email.ts popuni pri slanju. Worker tako nema React u bundleu. Pokretanje: npm run emails.
import { writeFileSync, mkdirSync } from "node:fs";
import { render, toPlainText } from "@react-email/components";
import Pozivnica, { NASLOV as POZIVNICA } from "../emails/Pozivnica";

const predlosci = { pozivnica: { naslov: POZIVNICA, el: <Pozivnica /> } };

let out = "// GENERIRANO: npm run emails (scripts/emails-export.tsx). Ne uređivati ručno, izvor je emails/*.tsx.\n\n";
for (const [ime, p] of Object.entries(predlosci)) {
  const html = await render(p.el);
  const text = toPlainText(html).replace(/^LLogoMedo/, "LogoMedo");
  out += `export const ${ime} = ${JSON.stringify({ naslov: p.naslov, html, text }, null, 2)} as const;\n\n`;
}
mkdirSync("src/lib/emails", { recursive: true });
writeFileSync("src/lib/emails/generirano.ts", out);
console.log("src/lib/emails/generirano.ts:", Object.keys(predlosci).join(", "));
