import { test } from "node:test";
import assert from "node:assert/strict";
import { slogovi } from "./slogovi.ts";
import { brojSlogova } from "./rima.ts";

const ocekivano: Record<string, string> = {
  // nastava.hr/slogovi
  mačka: "mač-ka", jabuka: "ja-bu-ka", prijatelj: "pri-ja-telj", vrt: "vrt", ruka: "ru-ka", morski: "mor-ski", sunce: "sun-ce",
  voda: "vo-da", kuća: "ku-ća", torba: "tor-ba", pismo: "pi-smo", krokodil: "kro-ko-dil", svemirski: "sve-mir-ski",
  planeta: "pla-ne-ta", grad: "grad", igra: "i-gra", lopata: "lo-pa-ta", komad: "ko-mad", trava: "tra-va", veslo: "ve-slo",
  grozd: "grozd", borba: "bor-ba", marka: "mar-ka", drvo: "dr-vo", ptica: "pti-ca", kukuruz: "ku-ku-ruz", računalo: "ra-ču-na-lo",
  prijateljstvo: "pri-ja-telj-stvo", podmornica: "pod-mor-ni-ca", najljepši: "naj-ljep-ši", slušati: "slu-ša-ti",
  ljubav: "lju-bav", džep: "džep", knjiga: "knji-ga", planinama: "pla-ni-na-ma", nepravda: "ne-prav-da",
  // zatvoreni slog (logopedica): suglasnik zatvara prvi slog
  poštar: "poš-tar", majmun: "maj-mun", lampa: "lam-pa", košara: "ko-ša-ra", patka: "pat-ka", sestra: "ses-tra",
  kruška: "kruš-ka", zvijezda: "zvijez-da", lastavica: "las-ta-vi-ca", pjesma: "pje-sma",
  // IJE, slogotvorno R, samoglasnici jedan do drugog, LJ/NJ
  rijeka: "rije-ka", krtica: "kr-ti-ca", crkva: "cr-kva", avion: "a-vi-on", konj: "konj", ljuljačka: "lju-ljač-ka", pjevanje: "pje-va-nje",
  // prefiksi
  izlet: "iz-let", odmor: "od-mor", oblak: "o-blak", nadimak: "na-di-mak",
};

test("slogovi: pravila rastavljanja (otvoreni i zatvoreni slog)", () => {
  for (const [r, o] of Object.entries(ocekivano)) assert.equal(slogovi(r).join("-"), o.toLocaleUpperCase("hr"), r);
});

test("slogovi: broj se slaže s brojSlogova, izraz po riječima", () => {
  for (const r of Object.keys(ocekivano)) assert.equal(slogovi(r).length, brojSlogova(r), r);
  assert.deepEqual(slogovi("luk-strijela"), ["LUK", "STRIJE", "LA"]);
});
