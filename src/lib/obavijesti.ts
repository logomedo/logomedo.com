// Obavijest superadminu e-poštom (docs/inbox/, S4): nova dolazna poruka u inboxu (webhook) i novi zahtjev na
// /pristup (odluka 710 landinga, sada kroz Resend). Primatelji su ADMIN_EMAILS. Mail nema ni ime, ni adresu, ni
// sadržaj (odluka 401), samo link u admin. Najviše jedna obavijest na sat po razgovoru, odnosno jedna na sat za sve
// zahtjeve (tablica `obavijesti`, migracija 0040). Ne baca: obavijest nikad ne smije srušiti webhook ni obrazac.
import { env } from "cloudflare:workers";
import { adminEmails } from "./admin/sesija";
import { obavijest } from "./emails/generirano";
import { ODGOVOR_NA, popuni } from "./email";

export const POSILJATELJ_OBAVIJESTI = "LogoMedo <obavijesti@logomedo.com>";
export const ADRESA_ADMINA = "https://logomedo.com";
/** Razmak između dvije obavijesti za isti izvor. */
export const OBAVIJEST_MINUTA = 60;

export type Izvor = { vrsta: "poruka"; razgovorId: number } | { vrsta: "zahtjev" };
export type IshodObavijesti = "poslano" | "preskoceno" | "nema_kljuca" | "nema_primatelja" | "greska";

const db = () => env.DB as D1Database;

/** Naslov, opis, link i gumb obavijesti. Čisto (testovi). */
export function sadrzajObavijesti(izvor: Izvor): { subject: string; text: string; html: string } {
  const v = izvor.vrsta === "poruka"
    ? { naslov: "Nova poruka u LogoMedu", opis: "U inboxu LogoMeda je nova poruka.", url: `${ADRESA_ADMINA}/admin/poruke/${izvor.razgovorId}`, gumb: "Otvori razgovor" }
    : { naslov: "Novi zahtjev za pristup LogoMedu", opis: "Na /pristup je stigao novi zahtjev za pristup.", url: `${ADRESA_ADMINA}/admin/zahtjevi`, gumb: "Otvori zahtjeve" };
  return { subject: v.naslov, text: popuni(obavijest.text, v, false), html: popuni(obavijest.html, v, true) };
}

/**
 * Pošalji obavijest ako za isti izvor nije poslana u zadnjih OBAVIJEST_MINUTA. Mjesto se zauzme atomski
 * (upsert s uvjetom), pa dva istodobna webhooka ne šalju dvije; neuspjelo slanje mjesto oslobađa.
 */
export async function obavijesti(izvor: Izvor, f: typeof fetch = fetch, sada = new Date()): Promise<IshodObavijesti> {
  try {
    const kljuc = env.RESEND_API_KEY;
    if (!kljuc) return "nema_kljuca";
    const za = [...adminEmails()];
    if (!za.length) return "nema_primatelja";
    const id = izvor.vrsta === "poruka" ? `razgovor:${izvor.razgovorId}` : "zahtjevi";
    const at = sada.toISOString();
    const granica = new Date(sada.getTime() - OBAVIJEST_MINUTA * 60_000).toISOString();
    const r = await db().prepare(
      `INSERT INTO obavijesti (kljuc, poslano_at) VALUES (?1, ?2)
       ON CONFLICT (kljuc) DO UPDATE SET poslano_at = excluded.poslano_at WHERE obavijesti.poslano_at <= ?3`,
    ).bind(id, at, granica).run();
    if (!r.meta.changes) return "preskoceno";

    const { subject, text, html } = sadrzajObavijesti(izvor);
    let ok = false;
    try {
      const odg = await f("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${kljuc}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: POSILJATELJ_OBAVIJESTI, to: za, reply_to: ODGOVOR_NA, subject, text, html }),
      });
      ok = odg.ok;
      if (!ok) console.error("obavijest: Resend", odg.status);
    } catch (e) {
      console.error("obavijest: mreža", String(e));
    }
    if (ok) return "poslano";
    await db().prepare("DELETE FROM obavijesti WHERE kljuc = ? AND poslano_at = ?").bind(id, at).run();
    return "greska";
  } catch (e) {
    console.error("obavijest: nije poslana", String((e as Error)?.message ?? e));
    return "greska";
  }
}
