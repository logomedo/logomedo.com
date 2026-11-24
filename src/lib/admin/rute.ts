// Rute samo za superadmina (docs/rbac/, inventar: docs/rbac/research/2026-11-16-rute-po-ulozi.md).
// Čisti TS, bez `cloudflare:workers`: koriste ga middleware (provjera), AdminOkvir i stranice (skrivanje
// poveznica) i testovi. Server je izvor istine; UI samo prati.
import type { Uloga } from "./ovlasti.ts";

/** Prefiksi: pogađa točna putanja i sve ispod nje (`prefiks/…`), ne `prefiksXYZ`. */
export const SAMO_SUPERADMIN = [
  "/admin/prompt",
  "/admin/red",
  "/admin/korisnici",
  // Zahtjevi za pristup s /pristup (S7 landinga): odobravanje izdaje pozivnicu.
  "/admin/zahtjevi",
  // Pogodnosti nakon bete (docs/pogodnosti.md): privatno obećanje besplatnog pristupa.
  "/admin/pogodnosti",
  // Inbox (docs/inbox/): dopisivanje s logopedima je osobni podatak, samo superadmin.
  "/admin/poruke",
  "/admin/zvukovi/glasovi",
  "/admin/api/zvuk-proba",
  // Klonovi glasa (docs/klon-glasa.md): ElevenLabs račun i suglasnost govornika.
  "/admin/zvukovi/klonovi",
  "/admin/api/klon",
  "/admin/app/prijava",
  "/admin/api/app-kod",
  // Uređivanje postojećeg kataloga (ovlast katalog.uredivanje): riječ (naziv, opis, pozicije, brisanje) i glasovi.
  "/admin/api/rijec",
  "/admin/api/novi-glas",
  "/admin/novi-glas",
] as const;

const pogada = (p: string) => SAMO_SUPERADMIN.some((r) => p === r || p.startsWith(`${r}/`));

/**
 * Je li putanja samo za superadmina. Kao `adminPutanja` u middlewareu: provjerava se i sirova i
 * dekodirana putanja (bez dvostrukih kosih crta, malim slovima); dovoljno je da pogodi jedna varijanta.
 */
export function rutaSamoSuperadmin(path: string): boolean {
  let dekodirano = path;
  try { dekodirano = decodeURIComponent(path); } catch { /* ostaje sirova */ }
  const normal = (p: string) => p.replace(/\/{2,}/g, "/").toLowerCase();
  return [path, normal(path), normal(dekodirano)].some(pogada);
}

/** Smije li uloga na poveznicu (za skrivanje u UI-ju). */
export const smijeNa = (uloga: Uloga, href: string) => uloga === "superadmin" || !rutaSamoSuperadmin(href);
