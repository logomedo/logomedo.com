// Pozivnice za logopede (docs/rbac/, odluke 2–5 i 105). Token iz linka `/admin/poziv#<token>`
// (32 B, base64url) vidi se samo jednom; u bazi je samo njegov sha-256. Vrijedi 72 h, jednokratna je
// i troši se tek uspješnim upisom passkeya, u istom D1 batchu u kojem nastaju korisnik i passkey.
// Nikad za e-mail iz ADMIN_EMAILS (superadmin nije redak u bazi, odluka 2).
import { env } from "cloudflare:workers";
import { adminEmails, randomToken, sha256Hex } from "./sesija";
import { novaGrupa, sZapisom, zapisNastalih, zapisSkupa, type Zapis } from "../aktivnost";
import { oznakaKljuca, type NoviPasskey } from "./passkey";
import { ZADANI_LIMIT } from "./ovlasti";

export const POZIV_SATI = 72;

export type RazlogOdbijanja = "email" | "superadmin" | "aktivan_logoped" | "nema_korisnika" | "nije_logoped" | "drugi_email" | "neaktivan";

/** Poruke za superadmina na /admin/uprava/korisnici (pozvani ih nikad ne vidi). */
export const PORUKE_ODBIJANJA: Record<RazlogOdbijanja, string> = {
  email: "Neispravan e-mail.",
  superadmin: "Taj e-mail je superadmin (ADMIN_EMAILS): pozivnica mu ne treba.",
  aktivan_logoped: "Taj logoped je već aktivan. Za novi uređaj koristi „Novi passkey” u njegovom retku.",
  nema_korisnika: "Nema tog korisnika.",
  nije_logoped: "Pozivnica za novi passkey je samo za logopeda.",
  drugi_email: "E-mail ne odgovara korisniku.",
  neaktivan: "Logoped je deaktiviran: novi passkey ga ne vraća. Za ponovni ulazak pošalji mu „Novu pozivnicu”.",
};

export class PozivOdbijen extends Error {
  readonly razlog: RazlogOdbijanja;
  constructor(razlog: RazlogOdbijanja) {
    super(`pozivnica odbijena: ${razlog}`);
    this.razlog = razlog;
  }
}

export interface Poziv { id: number; email: string; ime: string | null; korisnikId: number | null }

export const normalizirajEmail = (e: string) => e.trim().toLowerCase();
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
export const ispravanEmail = (e: string) => e.length <= 254 && EMAIL.test(e);
/** Token je točno 32 bajta u base64url (43 znaka); sve ostalo se ni ne traži u bazi. */
export const ispravanToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);

/** Otvorena pozivnica (uz `?` = sada). */
const OTVORENA = "iskoristena_at IS NULL AND opozvana_at IS NULL AND istjece > ?";
const sati = (d: Date, h: number) => new Date(d.getTime() + h * 3600_000);

/**
 * Nova pozivnica. Bez `korisnikId`: novi logoped (ili ponovni ulazak deaktiviranog). S `korisnikId`:
 * novi passkey postojećem aktivnom logopedu (izgubljen uređaj), e-mail mora biti njegov; deaktiviranog
 * vraća samo pozivnica bez `korisnikId` (iskorištenje postavlja `aktivan=1`). Prijašnja otvorena
 * pozivnica za isti e-mail prestaje vrijediti: vrijedi samo zadnji link. Baca `PozivOdbijen`.
 */
export async function izdaj(
  p: { email: string; ime?: string | null; korisnikId?: number | null },
  stvorio: string,
  sada = new Date(),
): Promise<{ token: string; id: number; email: string; istjece: string }> {
  const email = normalizirajEmail(p.email);
  if (!ispravanEmail(email)) throw new PozivOdbijen("email");
  if (adminEmails().has(email)) throw new PozivOdbijen("superadmin");
  let ime = (p.ime ?? "").trim().slice(0, 80) || null;
  let korisnikId: number | null = null;
  if (p.korisnikId != null) {
    const k = await env.DB.prepare("SELECT id, email, ime, uloga, aktivan FROM korisnici WHERE id = ?")
      .bind(p.korisnikId).first<{ id: number; email: string; ime: string | null; uloga: string; aktivan: number }>();
    if (!k) throw new PozivOdbijen("nema_korisnika");
    if (k.uloga !== "logoped") throw new PozivOdbijen("nije_logoped");
    if (normalizirajEmail(k.email) !== email) throw new PozivOdbijen("drugi_email");
    if (k.aktivan !== 1) throw new PozivOdbijen("neaktivan");
    korisnikId = k.id;
    ime ??= k.ime;
  } else {
    const k = await env.DB.prepare("SELECT uloga, aktivan FROM korisnici WHERE email = ?")
      .bind(email).first<{ uloga: string; aktivan: number }>();
    if (k?.uloga === "logoped" && k.aktivan === 1) throw new PozivOdbijen("aktivan_logoped");
  }

  const token = randomToken();
  const hash = await sha256Hex(token);
  const at = sada.toISOString();
  const istjece = sati(sada, POZIV_SATI).toISOString();
  const grupa = novaGrupa();
  const z = (radnja: string): Zapis => ({ tko: stvorio, radnja, tablica: "pozivi", grupa });
  const db = env.DB;
  const rez = await db.batch([
    ...zapisSkupa(z("poziv.zamijenjen"), {
      sql: "x.email = ? AND x.iskoristena_at IS NULL AND x.opozvana_at IS NULL AND x.istjece > ?", args: [email, at],
    }, [
      db.prepare(`UPDATE pozivi SET opozvana_at = ? WHERE email = ? AND ${OTVORENA}`).bind(at, email, at),
    ]),
    db.prepare(
      `INSERT INTO pozivi (token_hash, email, ime, korisnik_id, stvorio, created_at, istjece)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    ).bind(hash, email, ime, korisnikId, stvorio, at, istjece),
    zapisNastalih(z("poziv.izdan"), { sql: "x.token_hash = ?", args: [hash] }),
  ]);
  return { token, id: (rez[4].results[0] as { id: number }).id, email, istjece };
}

/** Pozivnica iz tokena ako je otvorena (postoji, nije istekla, opozvana ni iskorištena); inače null. */
export async function provjeri(token: unknown, sada = new Date()): Promise<Poziv | null> {
  if (!ispravanToken(token)) return null;
  const r = await env.DB.prepare(`SELECT id, email, ime, korisnik_id FROM pozivi WHERE token_hash = ? AND ${OTVORENA}`)
    .bind(await sha256Hex(token), sada.toISOString())
    .first<{ id: number; email: string; ime: string | null; korisnik_id: number | null }>();
  // ADMIN_EMAILS se mogao promijeniti nakon izdavanja.
  if (!r || adminEmails().has(normalizirajEmail(r.email))) return null;
  return { id: r.id, email: r.email, ime: r.ime, korisnikId: r.korisnik_id };
}

/**
 * Atomska potrošnja: uspije samo ako je pozivnica u tom trenutku otvorena i nije za superadmina.
 * `passkey_id` je oznaka ovog pokušaja: ostale naredbe istog batcha po njoj znaju da je baš on
 * potrošio pozivnicu (vrijeme nije dovoljno: dva pokušaja u istoj milisekundi).
 */
export function naredbaPotrosnje(tokenHash: string, passkeyId: string, sada: Date): D1PreparedStatement {
  const at = sada.toISOString();
  return env.DB.prepare(
    `UPDATE pozivi SET iskoristena_at = ?, passkey_id = ?
     WHERE token_hash = ? AND ${OTVORENA} AND email NOT IN (SELECT value FROM json_each(?))
     RETURNING id, email, ime, korisnik_id`,
  ).bind(at, passkeyId, tokenHash, at, JSON.stringify([...adminEmails()]));
}

/**
 * Naredbe za jedan `env.DB.batch`: potroši pozivnicu, korisnik postane aktivan logoped (novi redak
 * ili postojeći: `uloga='logoped', aktivan=1, deaktiviran_at=NULL`, odluka 105), upiše se passkey,
 * sve sa zapisima u aktivnosti. Korisnik i passkey nastaju samo uz redak pozivnice s ovim
 * `passkey_id`, tj. samo ako je UPDATE iz `naredbaPotrosnje` u ovom batchu nešto promijenio.
 * Rezultat potrošnje (RETURNING) je na indeksu `potrosnja`.
 */
export function naredbeIskoristenja(tokenHash: string, kljuc: NoviPasskey, label: string, tko: string, sada: Date, grupa = novaGrupa()) {
  const db = env.DB;
  const at = sada.toISOString();
  // Izvor e-maila je sam redak pozivnice koji je ovaj batch potrošio, ne parametar.
  const MOJA = "FROM pozivi p WHERE p.token_hash = ? AND p.passkey_id = ?";
  const z = (tablica: Zapis["tablica"], radnja: string): Zapis => ({ tko, radnja, tablica, grupa });
  const naredbe = [
    ...sZapisom(z("pozivi", "poziv.iskoristen"), { sql: "SELECT id FROM pozivi WHERE token_hash = ?", args: [tokenHash] }, [
      naredbaPotrosnje(tokenHash, kljuc.id, sada),
    ]),
    ...sZapisom(z("korisnici", "korisnik.aktiviran"),
      { sql: "SELECT id FROM korisnici WHERE email = (SELECT email FROM pozivi WHERE token_hash = ?)", args: [tokenHash] }, [
        db.prepare(
          `INSERT INTO korisnici (email, ime, uloga, aktivan, deaktiviran_at, limit_slike_7d, limit_zvukovi_7d)
           SELECT p.email, p.ime, 'logoped', 1, NULL, ${ZADANI_LIMIT.slike}, ${ZADANI_LIMIT.zvukovi} ${MOJA}
           ON CONFLICT (email) DO UPDATE SET uloga = 'logoped', aktivan = 1, deaktiviran_at = NULL,
             ime = COALESCE(excluded.ime, korisnici.ime)`,
        ).bind(tokenHash, kljuc.id),
      ]),
    db.prepare(
      `INSERT INTO admin_passkeys (id, email, public_key, counter, transports, label, created_at, rp_id)
       SELECT ?, p.email, ?, ?, ?, ?, ?, ? ${MOJA}`,
    ).bind(kljuc.id, kljuc.publicKey, kljuc.counter, kljuc.transports, oznakaKljuca(label), at, kljuc.rpId, tokenHash, kljuc.id),
  ];
  return { naredbe, potrosnja: 1 };
}

/**
 * Iskoristi pozivnicu novim (već provjerenim) passkeyem. Vraća pozivnicu ili null ako je u
 * međuvremenu potrošena, opozvana ili istekla; tada nema ni korisnika ni passkeya.
 * `tko` u zapisima aktivnosti je e-mail pozvanog.
 */
export async function iskoristi(token: string, kljuc: NoviPasskey, label = "", sada = new Date()): Promise<Poziv | null> {
  // Samo za `tko` u zapisima; odluku donosi UPDATE u batchu, ne ovo čitanje.
  const p = await provjeri(token, sada);
  if (!p) return null;
  const { naredbe, potrosnja } = naredbeIskoristenja(await sha256Hex(token), kljuc, label, p.email, sada);
  const rez = await env.DB.batch(naredbe);
  const r = rez[potrosnja].results[0] as { id: number; email: string; ime: string | null; korisnik_id: number | null } | undefined;
  return r ? { id: r.id, email: r.email, ime: r.ime, korisnikId: r.korisnik_id } : null;
}

/** Opozovi otvorenu (ili isteklu) pozivnicu. false: nema je ili je već iskorištena/opozvana. */
export async function opozovi(id: number, tko: string, sada = new Date()): Promise<boolean> {
  const rez = await env.DB.batch(sZapisom({ tko, radnja: "poziv.opozvan", tablica: "pozivi", grupa: novaGrupa() }, id, [
    env.DB.prepare("UPDATE pozivi SET opozvana_at = ? WHERE id = ? AND iskoristena_at IS NULL AND opozvana_at IS NULL RETURNING id")
      .bind(sada.toISOString(), id),
  ]));
  return rez[1].results.length > 0;
}

export interface OtvorenaPozivnica {
  id: number; email: string; ime: string | null; korisnik_id: number | null; stvorio: string; created_at: string; istjece: string;
}

export async function otvorenePozivnice(sada = new Date()): Promise<OtvorenaPozivnica[]> {
  return (await env.DB.prepare(
    `SELECT id, email, ime, korisnik_id, stvorio, created_at, istjece FROM pozivi WHERE ${OTVORENA} ORDER BY created_at DESC`,
  ).bind(sada.toISOString()).all<OtvorenaPozivnica>()).results;
}
