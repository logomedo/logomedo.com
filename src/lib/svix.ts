// Ručna provjera Svix potpisa (Resend webhooks), WebCrypto bez npm `svix` (odluka 7).
// Algoritam: docs/inbox/research/2026-11-19-resend-primanje.md §1 (docs.svix.com/receiving/verifying-payloads/how-manual).
// Potpisuje se `${svix-id}.${svix-timestamp}.${sirovo tijelo}` HMAC-SHA256 ključem iz `whsec_<base64>`;
// `svix-signature` je popis `v1,<base64>` odvojen razmacima i dovoljan je jedan koji odgovara.

/** Najveća razlika između `svix-timestamp` i sata Workera, u oba smjera (odluka 101). */
export const TOLERANCIJA_S = 5 * 60;

export type IshodPotpisa = { ok: true; id: string } | { ok: false; razlog: "tajna" | "zaglavlja" | "vrijeme" | "potpis" };

type Zaglavlja = Headers | Record<string, string | undefined>;

function zaglavlje(z: Zaglavlja, ime: string): string | null {
  if (z instanceof Headers) return z.get(ime);
  return z[ime] ?? z[ime.toLowerCase()] ?? null;
}

function izBase64(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const b = atob(s);
    const out = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function kljucIz(tajna: string, upotreba: "sign" | "verify"): Promise<CryptoKey | null> {
  const bajtovi = izBase64(tajna.trim().replace(/^whsec_/, ""));
  if (!bajtovi || bajtovi.length === 0) return null;
  return crypto.subtle.importKey("raw", bajtovi, { name: "HMAC", hash: "SHA-256" }, false, [upotreba]);
}

const sadrzaj = (id: string, vrijeme: string, tijelo: string) => new TextEncoder().encode(`${id}.${vrijeme}.${tijelo}`);

/** Potpis kakav šalje Svix (`v1,<base64>`); za testove i scripts/inbox-probni-webhook.ts. */
export async function potpisi(tajna: string, id: string, vrijeme: string | number, tijelo: string): Promise<string> {
  const k = await kljucIz(tajna, "sign");
  if (!k) throw new Error("svix: neispravan tajni ključ");
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, sadrzaj(id, String(vrijeme), tijelo)));
  return `v1,${btoa(String.fromCharCode(...mac))}`;
}

/**
 * Provjeri potpis webhooka. `tijelo` mora biti sirovo (request.text()), `sada` u milisekundama.
 * Usporedba ide kroz `crypto.subtle.verify` (konstantno vrijeme).
 */
export async function provjeriPotpis(tajna: string | undefined, zaglavlja: Zaglavlja, tijelo: string, sada: number = Date.now()): Promise<IshodPotpisa> {
  const k = tajna ? await kljucIz(tajna, "verify") : null;
  if (!k) return { ok: false, razlog: "tajna" };
  const id = zaglavlje(zaglavlja, "svix-id");
  const vrijeme = zaglavlje(zaglavlja, "svix-timestamp");
  const potpis = zaglavlje(zaglavlja, "svix-signature");
  if (!id || !vrijeme || !potpis || !/^\d{1,12}$/.test(vrijeme)) return { ok: false, razlog: "zaglavlja" };
  if (Math.abs(sada / 1000 - Number(vrijeme)) > TOLERANCIJA_S) return { ok: false, razlog: "vrijeme" };
  const podaci = sadrzaj(id, vrijeme, tijelo);
  for (const dio of potpis.split(" ")) {
    const [verzija, b64] = dio.split(",", 2);
    if (verzija !== "v1" || !b64) continue;
    const mac = izBase64(b64);
    if (mac && mac.length === 32 && (await crypto.subtle.verify("HMAC", k, mac, podaci))) return { ok: true, id };
  }
  return { ok: false, razlog: "potpis" };
}
