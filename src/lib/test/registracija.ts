// Šav za `node --test` (package.json: `node --import ./src/lib/test/registracija.ts`).
// Sinkroni hook (module.registerHooks, Node ≥ 22.15/23.5) u istoj niti, bez loader niti:
// 1. `cloudflare:workers` → cloudflare-workers.ts (promjenjivi `env`);
// 2. relativni import bez ekstenzije (`./sesija`, kako piše Astro/Vite kod) → probaj `.ts`.
// Produkcijski kod se zbog testova ne mijenja.
import { registerHooks } from "node:module";

const stub = import.meta.resolve("./cloudflare-workers.ts");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") return { url: stub, shortCircuit: true };
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      const bezEkstenzije = /^\.{1,2}\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier);
      if (!bezEkstenzije || (e as { code?: string }).code !== "ERR_MODULE_NOT_FOUND") throw e;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
