#!/usr/bin/env node
// Naracija za demo video: svaki redak iz <projekt>/narration.json → assets/voice/<id>.mp3
// kroz ElevenLabs /with-timestamps, plus assets/voice/timing.json (trajanje i vrijeme riječi).
// Ključ: ELEVENLABS_API_KEY iz okoline ili iz logomedo.com/.dev.vars (isti kao u appu).
// Postojeće datoteke se preskaču; --force <id> (ili --force all) ih ponovno generira.
//
//   node video/scripts/tts-elevenlabs.mjs video/01-uvod [--force s3-katalog]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const projekt = process.argv[2];
if (!projekt) { console.error("upotreba: tts-elevenlabs.mjs <projekt> [--force id|all]"); process.exit(1); }
const fi = process.argv.indexOf("--force");
const force = fi > 0 ? process.argv[fi + 1] : null;

function kljuc() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const dv = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".dev.vars");
  const m = readFileSync(dv, "utf8").match(/^ELEVENLABS_API_KEY=(.+)$/m);
  if (!m) throw new Error("nema ELEVENLABS_API_KEY u .dev.vars");
  return m[1].trim().replace(/^"|"$/g, "");
}

const cfg = JSON.parse(readFileSync(join(projekt, "narration.json"), "utf8"));
const out = join(projekt, "assets", "voice");
mkdirSync(out, { recursive: true });
const timingPath = join(out, "timing.json");
const timing = existsSync(timingPath) ? JSON.parse(readFileSync(timingPath, "utf8")) : {};
const key = kljuc();

function rijeci(a) {
  // znakovi → riječi s početkom i krajem
  const w = []; let cur = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) { w.push(cur); cur = null; } return; }
    if (!cur) cur = { text: "", start: a.character_start_times_seconds[i], end: 0 };
    cur.text += ch; cur.end = a.character_end_times_seconds[i];
  });
  if (cur) w.push(cur);
  return w;
}

for (const l of cfg.lines) {
  const mp3 = join(out, `${l.id}.mp3`);
  if (existsSync(mp3) && force !== "all" && force !== l.id && timing[l.id]?.text === l.text) { console.log("preskačem", l.id); continue; }
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${l.voice_id ?? cfg.voice_id}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text: l.text, model_id: l.model_id ?? cfg.model_id, language_code: cfg.language_code, voice_settings: cfg.voice_settings }),
  });
  if (!r.ok) throw new Error(`${l.id}: ${r.status} ${await r.text()}`);
  const j = await r.json();
  writeFileSync(mp3, Buffer.from(j.audio_base64, "base64"));
  const dur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3]).toString());
  timing[l.id] = { text: l.text, duration: +dur.toFixed(3), words: rijeci(j.alignment) };
  console.log(l.id, dur.toFixed(2) + " s");
}
writeFileSync(timingPath, JSON.stringify(timing, null, 2));
