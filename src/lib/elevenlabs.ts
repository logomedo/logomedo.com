// ElevenLabs: TTS (izgovor) i Scribe STT (automatska provjera). Ključ je secret ELEVENLABS_API_KEY.
import { env } from "cloudflare:workers";
import { izrezi } from "./mp3";
import { KONTEKST, NOSAC, razloziNacin } from "./zvukovi-tekst";

const API = "https://api.elevenlabs.io/v1";

/** Greška s HTTP statusom: 429 i 5xx se ponavljaju kasnije (`privremena`). */
export class GreskaElevenLabs extends Error {
  // Bez parametarskog svojstva (`public status`): node --test (strip-only TS) ga ne podržava.
  status: number;
  constructor(status: number, poruka: string) { super(poruka); this.status = status; }
  get privremena() { return this.status === 429 || this.status >= 500; }
}

async function provjeri(r: Response, sto: string): Promise<Response> {
  if (r.ok) return r;
  const t = (await r.text()).slice(0, 300);
  let poruka = t;
  try { const d = JSON.parse(t).detail; poruka = typeof d === "string" ? d : d?.message ?? t; } catch { /* tekst */ }
  throw new GreskaElevenLabs(r.status, `${sto}: HTTP ${r.status} ${poruka}`);
}

export async function izgovori(tekst: string, glasId: string, model: string, prethodni?: string): Promise<ArrayBuffer> {
  const r = await fetch(`${API}/text-to-speech/${encodeURIComponent(glasId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ text: tekst, model_id: model, language_code: "hr", ...(prethodni ? { previous_text: prethodni } : {}) }),
  });
  return (await provjeri(r, "TTS")).arrayBuffer();
}

/** Rečenica s vremenom svakog znaka; vraća mp3 od znaka `od` do kraja. */
async function izgovoriOd(tekst: string, od: number, glasId: string, model: string): Promise<ArrayBuffer> {
  const r = await fetch(`${API}/text-to-speech/${encodeURIComponent(glasId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ text: tekst, model_id: model, language_code: "hr" }),
  });
  const j = (await (await provjeri(r, "TTS")).json()) as { audio_base64: string; alignment?: { character_start_times_seconds: number[] } };
  const mp3 = Uint8Array.from(atob(j.audio_base64), (c) => c.charCodeAt(0));
  const t = j.alignment?.character_start_times_seconds[od];
  if (t === undefined) throw new GreskaElevenLabs(422, "TTS: nema vremenskih oznaka za rez");
  return izrezi(mp3, t).slice().buffer;
}

/** Snimka teksta zadanim načinom (zvukovi-tekst.ts: naciniZa): model, „+kontekst” ili „+rez”. */
export async function snimi(tekst: string, glasId: string, nacin: string): Promise<ArrayBuffer> {
  const { model, dodatak } = razloziNacin(nacin);
  if (dodatak === "kontekst") return izgovori(tekst, glasId, model, KONTEKST);
  if (dodatak === "rez") {
    // Riječ malim početnim slovom unutar rečenice, inače bi je model naglasio kao naslov.
    const rijec = tekst.charAt(0).toLocaleLowerCase("hr") + tekst.slice(1);
    return izgovoriOd(NOSAC + rijec, NOSAC.length, glasId, model);
  }
  return izgovori(tekst, glasId, model);
}

export async function prepisi(mp3: ArrayBuffer, mime = "audio/mpeg"): Promise<string> {
  const f = new FormData();
  f.set("model_id", "scribe_v1");
  f.set("language_code", "hrv");
  f.set("tag_audio_events", "false");
  f.set("file", new Blob([mp3], { type: mime }), mime === "audio/wav" ? "zvuk.wav" : "zvuk.mp3");
  const r = await fetch(`${API}/speech-to-text`, { method: "POST", headers: { "xi-api-key": env.ELEVENLABS_API_KEY }, body: f });
  return String(((await (await provjeri(r, "STT")).json()) as { text?: string }).text ?? "").trim();
}

export interface GlasEL { voice_id: string; name: string; category?: string; labels?: Record<string, string>; preview_url?: string }

/** Glasovi računa (treba dozvolu voices_read); bez nje prazan popis, pa admin upisuje ID ručno. */
export async function glasovi(): Promise<GlasEL[]> {
  try {
    const r = await fetch(`${API}/voices`, { headers: { "xi-api-key": env.ELEVENLABS_API_KEY } });
    if (!r.ok) return [];
    return ((await r.json()) as { voices?: GlasEL[] }).voices ?? [];
  } catch { return []; }
}

export interface GlasKnjiznice {
  voice_id: string; name: string; gender: string | null; age: string | null; accent: string | null;
  description: string | null; use_case: string | null; usage_character_count_1y: number | null;
}

/** Hrvatski glasovi iz ElevenLabs Voice Libraryja; rade izravno preko voice_id, bez dodavanja na račun. */
export async function hrvatskiGlasovi(): Promise<GlasKnjiznice[]> {
  try {
    const r = await fetch(`${API}/shared-voices?language=hr&page_size=100&sort=usage_character_count_1y`, { headers: { "xi-api-key": env.ELEVENLABS_API_KEY } });
    if (!r.ok) return [];
    const v = ((await r.json()) as { voices?: (GlasKnjiznice & { language?: string })[] }).voices ?? [];
    return v.filter((g) => g.language === "hr");
  } catch { return []; }
}

/**
 * Instant Voice Clone (docs/klon-glasa.md): POST /v1/voices/add s uzorcima. Treba dozvolu `voices_write`
 * i plan sa `can_use_instant_voice_cloning`. Vraća voice_id.
 */
export async function napraviKlon(ime: string, opis: string, uzorci: { ime: string; mime: string; podaci: ArrayBuffer }[], ukloniSum: boolean): Promise<{ voice_id: string; requires_verification?: boolean }> {
  const f = new FormData();
  f.set("name", ime);
  f.set("description", opis);
  f.set("remove_background_noise", ukloniSum ? "true" : "false");
  f.set("labels", JSON.stringify({ language: "hr" }));
  for (const u of uzorci) f.append("files", new Blob([u.podaci], { type: u.mime }), u.ime);
  const r = await fetch(`${API}/voices/add`, { method: "POST", headers: { "xi-api-key": env.ELEVENLABS_API_KEY }, body: f });
  return (await (await provjeri(r, "Klon")).json()) as { voice_id: string; requires_verification?: boolean };
}

/** Briše glas s računa (oslobađa mjesto). 404 znači da ga već nema. */
export async function obrisiGlas(voiceId: string): Promise<void> {
  const r = await fetch(`${API}/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE", headers: { "xi-api-key": env.ELEVENLABS_API_KEY } });
  if (r.status !== 404) await provjeri(r, "Brisanje glasa");
}

export interface Pretplata { tier: string; character_count: number; character_limit: number; voice_slots_used: number; voice_limit: number; can_use_instant_voice_cloning: boolean; can_use_professional_voice_cloning: boolean }

/** Plan računa (dozvola `user_read`); null ako ključ to ne smije. */
export async function pretplata(): Promise<Pretplata | null> {
  try {
    const r = await fetch(`${API}/user/subscription`, { headers: { "xi-api-key": env.ELEVENLABS_API_KEY } });
    return r.ok ? ((await r.json()) as Pretplata) : null;
  } catch { return null; }
}
