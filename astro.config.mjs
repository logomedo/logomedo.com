// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://logomedo.com",
  output: "server",
  adapter: cloudflare(),
});
