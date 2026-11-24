#!/usr/bin/env node
// Složi <projekt>/index.html iz scenes.json + assets/voice/timing.json + styles.css.
// Svaka scena traje lead + trajanje naracije + tail; naracija kreće na lead sekundi scene.
// Scena je compositions/<id>.html, a njezina naracija assets/voice/<id>.mp3 (ako postoji).
//   node video/scripts/build-root.mjs video/01-uvod
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const p = process.argv[2];
const cfg = JSON.parse(readFileSync(join(p, "scenes.json"), "utf8"));
const timing = JSON.parse(readFileSync(join(p, "assets/voice/timing.json"), "utf8"));
const css = readFileSync(join(p, "styles.css"), "utf8");
const r3 = (x) => Math.round(x * 1000) / 1000;

let t = 0; const hosts = [], audio = [], plan = [];
cfg.scenes.forEach((s, i) => {
  const lead = s.lead ?? cfg.lead, tail = s.tail ?? cfg.tail;
  const v = timing[s.id];
  const dur = r3(lead + (v?.duration ?? s.duration ?? 4) + tail);
  hosts.push(`      <div id="${s.id}" class="clip" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${r3(t)}" data-duration="${dur}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080"></div>`);
  if (v && existsSync(join(p, `assets/voice/${s.id}.mp3`)))
    audio.push(`      <audio id="vo-${s.id}" src="assets/voice/${s.id}.mp3" data-start="${r3(t + lead)}" data-duration="${v.duration}" data-track-index="2" data-volume="1"></audio>`);
  plan.push(`${s.id}\t${r3(t).toFixed(2)}–${r3(t + dur).toFixed(2)}\tglas od ${lead}`);
  t += dur;
});
const total = r3(Math.ceil(t * 10) / 10);
const m = cfg.music;
if (m) audio.push(`      <audio id="glazba" src="${m.src}" data-start="0" data-duration="${total}" data-track-index="3" data-volume="${m.volume}" data-fade-in="${m.fadeIn}" data-fade-out="${m.fadeOut}"></audio>`);

writeFileSync(join(p, "index.html"), `<!doctype html>
<!-- GENERIRANO: node video/scripts/build-root.mjs ${p.replace(/^.*video\//, "video/")} (ne uređivati ručno; mijenjaj scenes.json, styles.css ili compositions/) -->
<html lang="hr" data-resolution="landscape">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${cfg.id}" data-start="0" data-duration="${total}" data-width="1920" data-height="1080">
${hosts.join("\n")}
${audio.join("\n")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["${cfg.id}"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`);
console.log(plan.join("\n") + `\nukupno ${total} s`);
