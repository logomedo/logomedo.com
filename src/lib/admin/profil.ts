// Vlastiti profil na /admin/postavke: ime i prezime (svi) i e-mail (samo logoped). E-mail je ključ
// prijave i autorstva u više tablica (passkeyi, sesije, app, riječi, pregledi, dnevnik), pa se
// mijenja svugdje u jednoj transakciji: korisnik ostaje prijavljen, passkeyi i doprinos ostaju njegovi.
// Superadminu je e-mail u ADMIN_EMAILS (secret), pa ga ovdje ne može promijeniti.
import { env } from "cloudflare:workers";
import { adminEmails } from "./sesija";
import { ispravanEmail, normalizirajEmail } from "./pozivi";
import { korisnikId } from "../zadaci/baza";
import { novaGrupa, sZapisom } from "../aktivnost";
import type { Uloga } from "./ovlasti";

export const IME_MAX = 80;

export type Ishod = { ok: true; email: string } | { ok: false; greska: string };

/** Stupci koji pamte e-mail korisnika (malim slovima ili kako je upisan, pa usporedba s lower()). */
const STUPCI_EMAILA: [tablica: string, stupac: string][] = [
  ["admin_passkeys", "email"],
  ["admin_sessions", "email"],
  ["admin_challenges", "email"],
  ["app_kodovi", "email"],
  ["app_sesije", "email"],
  ["pozivi", "email"],
  ["pozivi", "stvorio"],
  ["rijeci", "dodao"],
  ["slike", "pregledao"],
  ["zvukovi", "pregledao"],
  ["aktivnost", "tko"],
  ["postavke", "izmijenio"],
  ["postavke_povijest", "izmijenio"],
  ["prompt_verzije", "autor"],
  ["zvuk_glas_biljeske", "izmijenio"],
];

export async function profil(email: string): Promise<{ ime: string; email: string }> {
  const r = await env.DB.prepare("SELECT ime FROM korisnici WHERE email = ?").bind(normalizirajEmail(email)).first<{ ime: string | null }>();
  return { ime: r?.ime ?? "", email: normalizirajEmail(email) };
}

export async function spremiProfil(
  s: { email: string; uloga: Uloga },
  unos: { ime: unknown; email: unknown },
): Promise<Ishod> {
  const ime = typeof unos.ime === "string" ? unos.ime.trim().replace(/\s+/g, " ") : "";
  if (ime.length > IME_MAX) return { ok: false, greska: `Ime i prezime može imati najviše ${IME_MAX} znakova.` };
  const stari = normalizirajEmail(s.email);
  const novi = typeof unos.email === "string" && unos.email.trim() ? normalizirajEmail(unos.email) : stari;
  if (novi !== stari) {
    if (s.uloga === "superadmin") return { ok: false, greska: "Superadminov e-mail je u ADMIN_EMAILS i ovdje se ne mijenja." };
    if (!ispravanEmail(novi)) return { ok: false, greska: "Neispravan e-mail." };
    if (adminEmails().has(novi)) return { ok: false, greska: "Taj e-mail već koristi drugi korisnik." };
    const zauzet = await env.DB.prepare(
      `SELECT 1 FROM korisnici WHERE email = ?
       UNION ALL SELECT 1 FROM pozivi WHERE email = ? AND iskoristena_at IS NULL AND opozvana_at IS NULL AND istjece > ?
       LIMIT 1`,
    ).bind(novi, novi, new Date().toISOString()).first();
    if (zauzet) return { ok: false, greska: "Taj e-mail već koristi drugi korisnik ili za njega postoji otvorena pozivnica." };
  }

  const id = await korisnikId(stari);
  const db = env.DB;
  const zapis = { tko: novi, radnja: "korisnik.profil", tablica: "korisnici" as const, grupa: novaGrupa() };
  const preimenuj = novi === stari ? [] : STUPCI_EMAILA.map(([t, c]) =>
    db.prepare(`UPDATE ${t} SET ${c} = ? WHERE lower(${c}) = ?`).bind(novi, stari));
  await db.batch([
    ...preimenuj,
    ...sZapisom(zapis, id, [
      db.prepare("UPDATE korisnici SET ime = ?, email = ? WHERE id = ?").bind(ime || null, novi, id),
    ]),
  ]);
  return { ok: true, email: novi };
}
