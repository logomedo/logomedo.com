// Inbox (docs/inbox/): razgovori i poruke u D1 (migracija 0039). Dolazne stižu kroz Resend webhook
// (src/lib/poruke-webhook.ts), odlazne upisuje slanje iz aplikacije (S2: pozivnica, S3: odgovor iz admina).
//
// Nit se traži redom iz odluke 4: ključ u adresi `odgovor+<kljuc>@poruke.logomedo.com`, pa Message-ID iz
// In-Reply-To/References, pa e-mail pošiljatelja; inače novi razgovor 'nerasporedjen'. Ništa se ne baca.
// Sadržaj poruka je osobni podatak: ova datoteka ne logira ništa i ne piše u `aktivnost`.
import { env } from "cloudflare:workers";

export const DOMENA_PORUKA = "poruke.logomedo.com";
const PREFIKS = "odgovor+";

const db = () => env.DB as D1Database;

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** Nasumičan ključ razgovora: 16 bajtova (128 bita) u base32 malim slovima, 26 znakova, bez PII. */
export function kljucRazgovora(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let bitovi = 0, vrijednost = 0, out = "";
  for (const x of b) {
    vrijednost = (vrijednost << 8) | x;
    bitovi += 8;
    while (bitovi >= 5) {
      out += BASE32[(vrijednost >>> (bitovi - 5)) & 31];
      bitovi -= 5;
    }
  }
  if (bitovi > 0) out += BASE32[(vrijednost << (5 - bitovi)) & 31];
  return out;
}

/** Adresa za odgovor (Reply-To) za razgovor. */
export function adresaZaOdgovor(kljuc: string): string {
  return `${PREFIKS}${kljuc}@${DOMENA_PORUKA}`;
}

/** `Ime Prezime <a@b.hr>` ili `a@b.hr` → normaliziran e-mail i ime (ako ga ima). */
export function razdvojiAdresu(s: string): { email: string; ime: string | null } {
  const t = s.trim();
  const m = t.match(/^(.*?)\s*<([^<>]+)>\s*$/);
  if (!m) return { email: t.toLowerCase(), ime: null };
  const ime = m[1].trim().replace(/^"(.*)"$/, "$1").trim();
  return { email: m[2].trim().toLowerCase(), ime: ime || null };
}

/** Ključ iz adrese `odgovor+<kljuc>@poruke.logomedo.com` (velika slova se ne razlikuju), inače null. */
export function kljucIzAdrese(adresa: string): string | null {
  const { email } = razdvojiAdresu(adresa);
  const at = email.lastIndexOf("@");
  if (at < 0 || email.slice(at + 1) !== DOMENA_PORUKA) return null;
  const lokalni = email.slice(0, at);
  if (!lokalni.startsWith(PREFIKS)) return null;
  const k = lokalni.slice(PREFIKS.length);
  return /^[a-z2-7]{16,64}$/.test(k) ? k : null;
}

/** Message-ID-jevi iz zaglavlja In-Reply-To/References (`<a@b> <c@d>`), redom, bez duplikata. */
export function messageIdovi(...zaglavlja: (string | null | undefined)[]): string[] {
  const ids = zaglavlja.flatMap((z) => (z ?? "").match(/<[^<>\s]+>/g) ?? []);
  return [...new Set(ids)];
}

export interface PronadjenRazgovor { id: number; nacin: "adresa" | "reference" | "posiljatelj" }

/** Nađi razgovor za dolaznu poruku (odluka 4). `za`: To, Cc i received_for; `od`: adresa pošiljatelja. */
export async function nadjiRazgovor(p: { za: string[]; reference: string[]; od: string }): Promise<PronadjenRazgovor | null> {
  for (const adresa of p.za) {
    const k = kljucIzAdrese(adresa);
    if (!k) continue;
    const r = await db().prepare("SELECT id FROM razgovori WHERE kljuc = ?").bind(k).first<{ id: number }>();
    if (r) return { id: r.id, nacin: "adresa" };
  }
  const ids = p.reference.slice(-50);
  if (ids.length) {
    const r = await db()
      .prepare(`SELECT razgovor_id FROM poruke WHERE message_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at DESC LIMIT 1`)
      .bind(...ids)
      .first<{ razgovor_id: number }>();
    if (r) return { id: r.razgovor_id, nacin: "reference" };
  }
  const { email } = razdvojiAdresu(p.od);
  if (email) {
    const r = await db().prepare("SELECT id FROM razgovori WHERE email = ? ORDER BY zadnja_at DESC LIMIT 1").bind(email).first<{ id: number }>();
    if (r) return { id: r.id, nacin: "posiljatelj" };
  }
  return null;
}

const SQL_NOVI_RAZGOVOR =
  `INSERT INTO razgovori (kljuc, email, ime, korisnik_id, predmet, zadnja_at, status, created_at)
   VALUES (?1, ?2, ?3, (SELECT id FROM korisnici WHERE email = ?2), ?4, ?5, ?6, ?5)`;

/** Novi razgovor (npr. prije slanja pozivnice, da `reply_to` nosi ključ). Vraća id i ključ. */
export async function noviRazgovor(p: { email: string; ime?: string | null; predmet?: string | null; sada?: string }): Promise<{ id: number; kljuc: string }> {
  const kljuc = kljucRazgovora();
  const sada = p.sada ?? new Date().toISOString();
  const r = await db()
    .prepare(`${SQL_NOVI_RAZGOVOR} RETURNING id`)
    .bind(kljuc, razdvojiAdresu(p.email).email, p.ime ?? null, p.predmet ?? null, sada, "otvoren")
    .first<{ id: number }>();
  return { id: r!.id, kljuc };
}

/** Obriši razgovor samo ako nema nijedne poruke (npr. slanje pozivnice nije uspjelo). */
export async function obrisiPrazanRazgovor(id: number): Promise<void> {
  await db().prepare("DELETE FROM razgovori WHERE id = ? AND NOT EXISTS (SELECT 1 FROM poruke WHERE razgovor_id = ?)").bind(id, id).run();
}

export interface PrivitakZapis { r2Kljuc: string | null; ime: string; tip: string; velicina: number | null; contentId?: string | null; napomena?: string | null }

export interface Dolazna {
  resendId: string;
  messageId: string | null;
  inReplyTo: string | null;
  /** Svi Message-ID-jevi iz In-Reply-To i References. */
  reference: string[];
  /** Pošiljatelj, `Ime <adresa>` ili gola adresa. */
  od: string;
  /** Primatelji (To, Cc, received_for); u njima se traži ključ razgovora. */
  za: string[];
  predmet: string | null;
  text: string | null;
  html: string | null;
  tijeloFali: boolean;
  napomena?: string | null;
  privitci: PrivitakZapis[];
  createdAt: string;
}

export type IshodDolazne = { nova: false } | { nova: true; porukaId: number; razgovorId: number; nacin: PronadjenRazgovor["nacin"] | "novi" };

const jeDuplikat = (e: unknown) => /UNIQUE constraint failed: poruke\.resend_id/.test(String((e as Error)?.message ?? e));

/**
 * Spremi dolaznu poruku. Idempotentno po `resendId` (Resend `email_id`): drugi put vraća `{ nova: false }`.
 * Razgovor (kad je nov), poruka, privitci i brojač nepročitanih idu u jednoj transakciji (batch).
 */
export async function spremiDolaznu(d: Dolazna): Promise<IshodDolazne> {
  if (await db().prepare("SELECT 1 FROM poruke WHERE resend_id = ?").bind(d.resendId).first()) return { nova: false };
  const nadjen = await nadjiRazgovor({ za: d.za, reference: d.reference, od: d.od });
  const posiljatelj = razdvojiAdresu(d.od);
  const upiti: D1PreparedStatement[] = [];
  let razgovor: { sql: string; vrijednost: number | string };
  if (nadjen) {
    razgovor = { sql: "?", vrijednost: nadjen.id };
  } else {
    const kljuc = kljucRazgovora();
    upiti.push(db().prepare(SQL_NOVI_RAZGOVOR).bind(kljuc, posiljatelj.email, posiljatelj.ime, d.predmet, d.createdAt, "nerasporedjen"));
    razgovor = { sql: "(SELECT id FROM razgovori WHERE kljuc = ?)", vrijednost: kljuc };
  }
  upiti.push(
    db()
      .prepare(
        `INSERT INTO poruke (razgovor_id, smjer, resend_id, message_id, in_reply_to, reference, od, za, predmet, text, html, tijelo_fali, napomena, created_at)
         VALUES (${razgovor.sql}, 'ulaz', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        razgovor.vrijednost, d.resendId, d.messageId, d.inReplyTo, d.reference.join(" ") || null, d.od.trim(), d.za.join(", "),
        d.predmet, d.text, d.html, d.tijeloFali ? 1 : 0, d.napomena ?? null, d.createdAt,
      ),
  );
  for (const p of d.privitci) {
    upiti.push(
      db()
        .prepare(
          `INSERT INTO privitci (poruka_id, r2_kljuc, ime, tip, velicina, content_id, napomena)
           SELECT id, ?, ?, ?, ?, ?, ? FROM poruke WHERE resend_id = ?`,
        )
        .bind(p.r2Kljuc, p.ime, p.tip, p.velicina, p.contentId ?? null, p.napomena ?? null, d.resendId),
    );
  }
  // Zatvoren razgovor se novom porukom opet otvara; 'nerasporedjen' ostaje dok ga superadmin ne razvrsta.
  upiti.push(
    db()
      .prepare(
        `UPDATE razgovori SET
           neprocitano = (SELECT COUNT(*) FROM poruke WHERE razgovor_id = razgovori.id AND smjer = 'ulaz' AND procitano_at IS NULL),
           zadnja_at = MAX(zadnja_at, ?),
           status = CASE status WHEN 'zatvoren' THEN 'otvoren' ELSE status END
         WHERE id = ${razgovor.sql}
         RETURNING id`,
      )
      .bind(d.createdAt, razgovor.vrijednost),
  );
  let rez: D1Result[];
  try {
    rez = await db().batch(upiti);
  } catch (e) {
    if (jeDuplikat(e)) return { nova: false };
    throw e;
  }
  const razgovorId = (rez.at(-1)!.results[0] as { id: number }).id;
  const p = await db().prepare("SELECT id FROM poruke WHERE resend_id = ?").bind(d.resendId).first<{ id: number }>();
  return { nova: true, porukaId: p!.id, razgovorId, nacin: nadjen?.nacin ?? "novi" };
}

export interface Odlazna {
  razgovorId: number;
  resendId: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  reference?: string[];
  od: string;
  za: string[];
  predmet: string | null;
  text: string | null;
  html: string | null;
  /** E-mail superadmina; null za automatske mailove (pozivnica). */
  poslao: string | null;
  createdAt?: string;
}

/** Upiši poslanu poruku u razgovor. Vraća id poruke. */
export async function spremiOdlaznu(o: Odlazna): Promise<number> {
  const sada = o.createdAt ?? new Date().toISOString();
  const [r] = await db().batch([
    db()
      .prepare(
        `INSERT INTO poruke (razgovor_id, smjer, resend_id, message_id, in_reply_to, reference, od, za, predmet, text, html, created_at, procitano_at, poslao)
         VALUES (?, 'izlaz', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .bind(
        o.razgovorId, o.resendId, o.messageId ?? null, o.inReplyTo ?? null, o.reference?.join(" ") || null, o.od, o.za.join(", "),
        o.predmet, o.text, o.html, sada, sada, o.poslao,
      ),
    // Odgovor iz admina znači da je razgovor razvrstan: 'nerasporedjen' postaje 'otvoren'.
    db()
      .prepare("UPDATE razgovori SET zadnja_at = MAX(zadnja_at, ?), status = CASE status WHEN 'nerasporedjen' THEN 'otvoren' ELSE status END WHERE id = ?")
      .bind(sada, o.razgovorId),
  ]);
  return (r.results[0] as { id: number }).id;
}

/** Postoji li već poruka s tim Resend id-jem (ponovljeno slanje s istim Idempotency-Key). */
export async function porukaPoResendId(resendId: string): Promise<number | null> {
  return (await db().prepare("SELECT id FROM poruke WHERE resend_id = ?").bind(resendId).first<{ id: number }>())?.id ?? null;
}

/** Označi sve dolazne poruke razgovora pročitanima. */
export async function oznaciProcitano(razgovorId: number, sada: string = new Date().toISOString()): Promise<void> {
  await db().batch([
    db().prepare("UPDATE poruke SET procitano_at = ? WHERE razgovor_id = ? AND smjer = 'ulaz' AND procitano_at IS NULL").bind(sada, razgovorId),
    db().prepare("UPDATE razgovori SET neprocitano = 0 WHERE id = ?").bind(razgovorId),
  ]);
}

/** Ukupan broj nepročitanih dolaznih poruka (brojač u bočnoj traci superadmina). */
export async function brojNeprocitanih(): Promise<number> {
  const r = await db().prepare("SELECT COALESCE(SUM(neprocitano), 0) AS n FROM razgovori WHERE neprocitano > 0").first<{ n: number }>();
  return r?.n ?? 0;
}

// ---- Admin (/admin/poruke, S3) ----

export type StatusRazgovora = "otvoren" | "zatvoren" | "nerasporedjen";

export interface Razgovor {
  id: number; kljuc: string; email: string; ime: string | null; korisnik_id: number | null; predmet: string | null;
  zadnja_at: string; neprocitano: number; status: StatusRazgovora; created_at: string;
}

export interface StavkaPopisa extends Razgovor { poruka: number; isjecak: string | null; zadnji_smjer: "ulaz" | "izlaz" | null }

/** Linija kojom počinje citirani prethodni mail (Gmail, Outlook, Apple Mail; hr, en, de). */
const UVOD_CITATA = /^(On .+ wrote:|.+ je napisao\/la:|.+ (je )?napisao:|.+ (je )?napisala:|Dana .+:|Am .+ schrieb .+:|-{2,} ?(Original|Izvorna) .+-{2,}|From: .+|Od: .+|Šalje: .+)\s*$/i;

/**
 * Tekst poruke bez citata prethodnih mailova: reže na prvoj liniji koja počinje s `>` ili na uvodu citata
 * („On … wrote:”, „… je napisao/la:”, „-----Original Message-----”). Gmail uvod zna prelomiti u dva retka,
 * pa se gleda i spoj s idućim retkom.
 */
export function razdvojiCitat(text: string | null): { tekst: string; citat: string } {
  if (!text) return { tekst: "", citat: "" };
  const linije = text.replace(/\r\n?/g, "\n").split("\n");
  let kraj = linije.length;
  for (let i = 0; i < linije.length; i++) {
    const l = linije[i].trim();
    if (l.startsWith(">") || UVOD_CITATA.test(l) || (i + 1 < linije.length && UVOD_CITATA.test(`${l} ${linije[i + 1].trim()}`) && /^(On|Dana|Am) /i.test(l))) {
      kraj = i;
      break;
    }
  }
  const cisto = (x: string[]) => x.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { tekst: cisto(linije.slice(0, kraj)), citat: cisto(linije.slice(kraj)) };
}

export const bezCitata = (text: string | null): string => razdvojiCitat(text).tekst;

/** Kratak isječak za popis: tekst bez citata, razmaci stisnuti, do `max` znakova. */
export function isjecak(text: string | null, max = 140): string {
  const t = bezCitata(text).replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Popis razgovora: nepročitani prvi, zatim po zadnjoj poruci. */
export async function popisRazgovora(limit = 300): Promise<StavkaPopisa[]> {
  const r = await db()
    .prepare(
      `SELECT r.*,
         (SELECT COUNT(*) FROM poruke WHERE razgovor_id = r.id) AS poruka,
         (SELECT substr(COALESCE(text, ''), 1, 2000) FROM poruke WHERE razgovor_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) AS isjecak,
         (SELECT smjer FROM poruke WHERE razgovor_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) AS zadnji_smjer
       FROM razgovori r
       ORDER BY (r.neprocitano > 0) DESC, r.zadnja_at DESC, r.id DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<StavkaPopisa>();
  return r.results.map((x) => ({ ...x, isjecak: isjecak(x.isjecak) || null }));
}

export interface Privitak { id: number; poruka_id: number; r2_kljuc: string | null; ime: string; tip: string; velicina: number | null; content_id: string | null; napomena: string | null }

export interface Poruka {
  id: number; razgovor_id: number; smjer: "ulaz" | "izlaz"; resend_id: string | null; message_id: string | null;
  in_reply_to: string | null; reference: string | null; od: string; za: string; predmet: string | null;
  text: string | null; html: string | null; tijelo_fali: number; napomena: string | null; created_at: string;
  procitano_at: string | null; poslao: string | null; privitci: Privitak[];
}

export async function razgovor(id: number): Promise<Razgovor | null> {
  return db().prepare("SELECT * FROM razgovori WHERE id = ?").bind(id).first<Razgovor>();
}

/** Razgovor s porukama kronološki i privitcima uz svaku poruku; null ako ne postoji. */
export async function nit(id: number): Promise<{ razgovor: Razgovor; poruke: Poruka[] } | null> {
  const [r, p, x] = await db().batch([
    db().prepare("SELECT * FROM razgovori WHERE id = ?").bind(id),
    db().prepare("SELECT * FROM poruke WHERE razgovor_id = ? ORDER BY created_at, id").bind(id),
    db().prepare("SELECT x.* FROM privitci x JOIN poruke p ON p.id = x.poruka_id WHERE p.razgovor_id = ? ORDER BY x.id").bind(id),
  ]);
  const rz = r.results[0] as Razgovor | undefined;
  if (!rz) return null;
  const privitci = x.results as unknown as Privitak[];
  const poruke = (p.results as unknown as Omit<Poruka, "privitci">[]).map((m) => ({ ...m, privitci: privitci.filter((a) => a.poruka_id === m.id) }));
  return { razgovor: rz, poruke };
}

/** Privitak za admin rutu preuzimanja. */
export async function privitak(id: number): Promise<Privitak | null> {
  return db().prepare("SELECT * FROM privitci WHERE id = ?").bind(id).first<Privitak>();
}

export async function postaviStatus(id: number, status: StatusRazgovora): Promise<boolean> {
  const r = await db().prepare("UPDATE razgovori SET status = ? WHERE id = ?").bind(status, id).run();
  return (r.meta.changes ?? 0) > 0;
}

export const putanjaPrivitka = (id: number) => `/admin/poruke/privitak/${id}`;

const cidKljuc = (cid: string) => cid.trim().replace(/^<|>$/g, "").toLowerCase();

/**
 * HTML dolazne poruke za `iframe sandbox` (srcdoc): `cid:` slike koje se stvarno pojavljuju u HTML-u idu kroz
 * admin rutu privitka (samo spremljene u R2), poveznice se otvaraju u novoj kartici. Vraća i id-jeve ugrađenih
 * privitaka; ostali se prikazuju kao popis (Gmail šalje `content_id` i za obične privitke, odluka 206).
 */
export function htmlZaPrikaz(html: string, privitci: Pick<Privitak, "id" | "r2_kljuc" | "content_id">[]): { html: string; ugradeni: number[] } {
  const poCid = new Map(privitci.filter((p) => p.content_id && p.r2_kljuc).map((p) => [cidKljuc(p.content_id!), p.id]));
  const ugradeni = new Set<number>();
  const prepisan = html.replace(/(["'(\s=])cid:([^"')\s>]+)/gi, (cijelo, prije: string, cid: string) => {
    let k = cid;
    try { k = decodeURIComponent(cid); } catch { /* ostaje */ }
    const id = poCid.get(cidKljuc(k));
    if (id === undefined) return cijelo;
    ugradeni.add(id);
    return `${prije}${putanjaPrivitka(id)}?prikaz=1`;
  });
  return { html: `<base target="_blank">${prepisan}`, ugradeni: [...ugradeni] };
}

/** Zadnja dolazna poruka (za citat i In-Reply-To) i zadnji poznati message_id odlazne (rezerva za nit). */
export async function zaOdgovor(razgovorId: number): Promise<{
  razgovor: Razgovor;
  dolazna: Pick<Poruka, "message_id" | "reference" | "text" | "od" | "predmet" | "created_at"> | null;
  odlazna: Pick<Poruka, "message_id" | "reference" | "predmet"> | null;
} | null> {
  const [r, d, o] = await db().batch([
    db().prepare("SELECT * FROM razgovori WHERE id = ?").bind(razgovorId),
    db().prepare("SELECT message_id, reference, text, od, predmet, created_at FROM poruke WHERE razgovor_id = ? AND smjer = 'ulaz' ORDER BY created_at DESC, id DESC LIMIT 1").bind(razgovorId),
    db().prepare("SELECT message_id, reference, predmet FROM poruke WHERE razgovor_id = ? AND smjer = 'izlaz' AND message_id IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1").bind(razgovorId),
  ]);
  const rz = r.results[0] as Razgovor | undefined;
  if (!rz) return null;
  return { razgovor: rz, dolazna: (d.results[0] as never) ?? null, odlazna: (o.results[0] as never) ?? null };
}

/** Spremi Message-ID odlazne poruke (dohvaćen iz Resenda nakon slanja, odluka 206). */
export async function postaviMessageId(porukaId: number, messageId: string): Promise<void> {
  await db().prepare("UPDATE poruke SET message_id = ? WHERE id = ?").bind(messageId, porukaId).run();
}

// ---- Brzi odgovori ----

export interface BrziOdgovor { id: number; kratica: string; naslov: string; tekst: string; updated_at: string }

export async function brziOdgovori(): Promise<BrziOdgovor[]> {
  return (await db().prepare("SELECT * FROM brzi_odgovori ORDER BY kratica").all<BrziOdgovor>()).results;
}

/** Kratica: mala slova (i hrvatska), brojke, crtica i podvlaka, do 30 znakova; upisuje se bez kose crte. */
export const KRATICA = /^[a-z0-9čćđšž_-]{1,30}$/;
export const BRZI_TEKST_MAX = 5000;

export type IshodBrzog = { ok: true; id: number } | { ok: false; greska: string };

export async function spremiBrziOdgovor(b: { id?: number | null; kratica: string; naslov: string; tekst: string }): Promise<IshodBrzog> {
  const kratica = b.kratica.trim().replace(/^\//, "").toLowerCase();
  const naslov = b.naslov.trim();
  const tekst = b.tekst.replace(/\r\n?/g, "\n").trim();
  if (!KRATICA.test(kratica)) return { ok: false, greska: "Kratica smije imati samo mala slova, brojke, - i _ (do 30 znakova)." };
  if (!naslov || naslov.length > 120) return { ok: false, greska: "Naslov je obavezan (do 120 znakova)." };
  if (!tekst || tekst.length > BRZI_TEKST_MAX) return { ok: false, greska: `Tekst je obavezan (do ${BRZI_TEKST_MAX} znakova).` };
  const sada = new Date().toISOString();
  try {
    if (b.id) {
      const r = await db().prepare("UPDATE brzi_odgovori SET kratica = ?, naslov = ?, tekst = ?, updated_at = ? WHERE id = ? RETURNING id").bind(kratica, naslov, tekst, sada, b.id).first<{ id: number }>();
      return r ? { ok: true, id: r.id } : { ok: false, greska: "Brzi odgovor više ne postoji." };
    }
    const r = await db().prepare("INSERT INTO brzi_odgovori (kratica, naslov, tekst, updated_at) VALUES (?, ?, ?, ?) RETURNING id").bind(kratica, naslov, tekst, sada).first<{ id: number }>();
    return { ok: true, id: r!.id };
  } catch (e) {
    if (/UNIQUE constraint failed: brzi_odgovori\.kratica/.test(String((e as Error)?.message ?? e))) return { ok: false, greska: `Kratica /${kratica} već postoji.` };
    throw e;
  }
}

export async function obrisiBrziOdgovor(id: number): Promise<boolean> {
  const r = await db().prepare("DELETE FROM brzi_odgovori WHERE id = ?").bind(id).run();
  return (r.meta.changes ?? 0) > 0;
}
