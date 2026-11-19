// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://logomedo.com",
  output: "server",
  // Prerenderirani landing kao katalog.html (ne katalog/index.html): Cloudflare assets onda služi /katalog bez
  // preusmjeravanja na /katalog/, kao kanonski URL (src/landing/konstante.ts).
  build: { format: "file" },
  adapter: cloudflare(),
});
