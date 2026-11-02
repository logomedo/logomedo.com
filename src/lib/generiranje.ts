// Red generiranja slika. Admin dodaje poslove, lokalni runner (scripts/runner.sh)
// ih uzima preko /api/runner/* i vraća sliku (Vertex AI preko gcloud prijave na Macu), pa Worker
// ne generira ništa sam.
import { env } from "cloudflare:workers";
import { stil as stilPoKodu, type Stil } from "./katalog";
import { zazvoni } from "./runner-zvono";
import { novaGrupa, sZapisom, zapisNastalih, zapisSkupa } from "./aktivnost";
import { aktivnaSistemska, postavka, redPauziran } from "./postavke";
import { spojiPrompt } from "./prompt";

const ZASTARIO_MIN = 15;
const MAX_POKUSAJA = 3;

/** Prompt iz predloška stila. Razlozi odbijenih slika te riječi ulaze kao napomena. */
export function sloziPrompt(stil: Stil, r: { rijec: string; opis_za_sliku: string | null }, razlozi: string[], napomena?: string) {
  const dodatak = [
    napomena?.trim(),
    ...razlozi.map((x) => `Avoid: ${x}`),
  ].filter(Boolean).join(" ");
  return stil.predlozak
    .replaceAll("{rijec}", r.rijec.toLocaleUpperCase("hr"))
    .replaceAll("{opis}", r.opis_za_sliku?.trim() || "the most common everyday meaning")
    .replaceAll("{napomena}", dodatak)
    .trim();
}

/** Dodaje posao za svaku riječ koja ga već nema u redu. Vraća broj dodanih. `grupa`: dio veće radnje u dnevniku. */
export async function dodajURed(stil: Stil, rijecIds: number[], email: string, napomena?: string, grupa = novaGrupa()): Promise<number> {
  if (!rijecIds.length) return 0;
  const db = env.DB;
  let dodano = 0;
  for (let i = 0; i < rijecIds.length; i += 50) {
    const dio = rijecIds.slice(i, i + 50);
    const mjesta = dio.map(() => "?").join(",");
    const { results: rijeci } = await db.prepare(
      `SELECT r.id, r.rijec, r.opis_za_sliku,
         (SELECT json_group_array(s.razlog) FROM slike s WHERE s.rijec_id = r.id AND s.stil_id = ? AND s.status = 'odbijena' AND s.razlog IS NOT NULL) AS razlozi
       FROM rijeci r WHERE r.id IN (${mjesta})
         AND NOT EXISTS (SELECT 1 FROM generiranja q WHERE q.rijec_id = r.id AND q.stil_id = ? AND q.status IN ('ceka','radi'))`,
    ).bind(stil.id, ...dio, stil.id).all<{ id: number; rijec: string; opis_za_sliku: string | null; razlozi: string }>();
    if (!rijeci.length) continue;
    await db.batch([
      ...rijeci.map((r) =>
        db.prepare(`INSERT INTO generiranja (rijec_id, stil_id, prompt, zatrazio, predlozak_verzija)
                      VALUES (?1, ?2, ?3, ?4, (SELECT predlozak_verzija FROM stilovi WHERE id = ?2))`)
          .bind(r.id, stil.id, sloziPrompt(stil, r, JSON.parse(r.razlozi ?? "[]").slice(-3), napomena), email)),
      // Batch je transakcija, pa su zadnjih n poslova upravo ovi.
      zapisNastalih({ tko: email, radnja: "generiranje.zatrazeno", tablica: "generiranja", grupa },
        { sql: "x.id IN (SELECT id FROM generiranja ORDER BY id DESC LIMIT ?)", args: [rijeci.length] }),
    ]);
    dodano += rijeci.length;
  }
  if (dodano) await zazvoni();
  return dodano;
}

/** Za posao `x` već postoji odobrena slika ili kandidat istog stila, nastao nakon posla. */
const IMA_NOVIJU = `EXISTS (SELECT 1 FROM slike s WHERE s.rijec_id = x.rijec_id AND s.stil_id = x.stil_id
  AND s.status IN ('odobrena', 'kandidat') AND s.created_at > x.created_at)`;

export interface Posao { id: number; prompt: string; rijec: string; slug: string; stil: string; pokusaji: number }

/**
 * Uzima najstariji posao. Zaglavljeni ('radi' > 15 min) prvo se vraćaju u red. Dok je red pauziran
 * (/admin/prompt) ne daje ništa. Prompt koji runner dobije = prompt posla + sistemski prompt u tom trenutku.
 */
export async function uzmi(): Promise<Posao | null> {
  const db = env.DB;
  await db.prepare(
    `UPDATE generiranja SET status = 'ceka' WHERE status = 'radi' AND uzeto_at < datetime('now', '-${ZASTARIO_MIN} minutes')`,
  ).run();
  if (await redPauziran()) return null;
  // Slika nastala nakon što je posao dodan (ručni upload, drugi posao) znači da posao više ne treba:
  // makni ga iz reda prije nego runner potroši poziv na duplikat.
  await db.batch(zapisSkupa(
    { tko: "runner", radnja: "generiranje.uklonjeno", tablica: "generiranja", grupa: novaGrupa() },
    { sql: `x.status = 'ceka' AND ${IMA_NOVIJU}`, args: [] },
    [db.prepare(`DELETE FROM generiranja AS x WHERE x.status = 'ceka' AND ${IMA_NOVIJU}`)],
  ));
  const sistemski = await postavka("sistemski_prompt");
  const verzija = await aktivnaSistemska();
  const p = await db.prepare(
    `UPDATE generiranja SET status = 'radi', uzeto_at = datetime('now'), pokusaji = pokusaji + 1, sistemski = ?, sistemski_verzija = ?
     WHERE id = (SELECT id FROM generiranja WHERE status = 'ceka' ORDER BY id LIMIT 1) AND status = 'ceka'
     RETURNING id, rijec_id, stil_id, prompt, pokusaji`,
  ).bind(sistemski, verzija).first<{ id: number; rijec_id: number; stil_id: number; prompt: string; pokusaji: number }>();
  if (!p) return null;
  const r = await db.prepare(
    "SELECT r.rijec, r.slug, s.kod AS stil FROM rijeci r, stilovi s WHERE r.id = ? AND s.id = ?",
  ).bind(p.rijec_id, p.stil_id).first<{ rijec: string; slug: string; stil: string }>();
  return { id: p.id, prompt: spojiPrompt(p.prompt, sistemski), pokusaji: p.pokusaji, ...r! };
}

export const MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const MAX_BAJTOVA = 8 * 1024 * 1024;

/** Slika od runnera: u R2, u `slike` kao kandidat, posao gotov. */
export async function predaj(posaoId: number, mime: string, tijelo: ArrayBuffer, model?: string | null): Promise<{ slikaId: number } | { greska: string }> {
  const db = env.DB;
  const p = await db.prepare(
    `SELECT q.id, q.rijec_id, q.stil_id, q.prompt, q.sistemski, r.slug, s.kod, s.model FROM generiranja q
     JOIN rijeci r ON r.id = q.rijec_id JOIN stilovi s ON s.id = q.stil_id WHERE q.id = ? AND q.status = 'radi'`,
  ).bind(posaoId).first<{ id: number; rijec_id: number; stil_id: number; prompt: string; sistemski: string | null; slug: string; kod: string; model: string }>();
  if (!p) return { greska: "posao ne postoji ili nije u radu" };

  const sp = await spremi({ rijecId: p.rijec_id, stilId: p.stil_id, stilKod: p.kod, slug: p.slug }, mime, tijelo, spojiPrompt(p.prompt, p.sistemski), model?.trim().slice(0, 100) || p.model, "agy", "runner");
  if ("greska" in sp) return sp;
  await db.prepare("UPDATE generiranja SET status = 'gotovo', zavrseno_at = datetime('now'), slika_id = ?, greska = NULL WHERE id = ?")
    .bind(sp.slikaId, p.id).run();
  return sp;
}

export const MAX_SVG_BAJTOVA = 2 * 1024 * 1024;

/** Zajedničko runneru i ručnom uploadu: R2 (ključ = hash sadržaja) + redak u `slike` kao kandidat. */
async function spremi(
  c: { rijecId: number; stilId: number; stilKod: string; slug: string },
  mime: string, tijelo: ArrayBuffer, prompt: string | null, model: string | null, izvor: "agy" | "upload", tko: string,
): Promise<{ slikaId: number } | { greska: string }> {
  const ext = MIME[mime];
  if (!ext) return { greska: `nepodržan tip ${mime || "(nepoznat)"}; samo PNG, JPEG ili WebP` };
  if (tijelo.byteLength === 0 || tijelo.byteLength > MAX_BAJTOVA) return { greska: "prazna ili prevelika slika (najviše 8 MB)" };
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", tijelo))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const kljuc = `${c.stilKod}/${c.slug}/${hash.slice(0, 16)}.${ext}`;
  const ista = await env.DB.prepare("SELECT id FROM slike WHERE r2_kljuc = ?").bind(kljuc).first<{ id: number }>();
  if (ista) return { greska: `ista slika već postoji (#${ista.id})` };
  await env.SLIKE.put(kljuc, tijelo, { httpMetadata: { contentType: mime } });
  const [, upis] = await env.DB.batch(sZapisom(
    { tko, radnja: izvor === "agy" ? "slika.nova" : "slika.ucitana", tablica: "slike", grupa: novaGrupa() },
    { sql: "SELECT id FROM slike WHERE r2_kljuc = ?", args: [kljuc] },
    [env.DB.prepare(
      `INSERT INTO slike (rijec_id, stil_id, r2_kljuc, sha256, mime, bajtova, prompt, model, izvor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    ).bind(c.rijecId, c.stilId, kljuc, hash, mime, tijelo.byteLength, prompt, model, izvor)],
  ));
  return { slikaId: (upis.results[0] as { id: number }).id };
}

/** Ručni upload slike iz vanjskog alata (Gemini web, Leonardo…) s promptom kako je nastala. Ulazi kao kandidat. */
export async function ucitaj(rijecId: number, stilKod: string, mime: string, tijelo: ArrayBuffer, prompt: string, alat: string | null, email: string) {
  const c = await env.DB.prepare(
    "SELECT r.id AS rijecId, r.slug, s.id AS stilId, s.kod AS stilKod FROM rijeci r, stilovi s WHERE r.id = ? AND s.kod = ?",
  ).bind(rijecId, stilKod).first<{ rijecId: number; slug: string; stilId: number; stilKod: string }>();
  if (!c) return { greska: "nema te riječi ili stila" };
  return spremi(c, mime, tijelo, prompt, alat, "upload", email);
}

/** SVG (potrace) uz postojeću sliku: R2 pod istim ključem s .svg, a ako je slika odobrena, i u javni bucket. */
export async function predajSvg(slikaId: number, tijelo: ArrayBuffer): Promise<{ svgKljuc: string } | { greska: string }> {
  if (tijelo.byteLength === 0 || tijelo.byteLength > MAX_SVG_BAJTOVA) return { greska: "prazan ili prevelik SVG" };
  const pocetak = new TextDecoder().decode(tijelo.slice(0, 512));
  if (!/<svg[\s>]/.test(pocetak) || /<script|javascript:|\son[a-z]+\s*=/i.test(new TextDecoder().decode(tijelo))) return { greska: "nije čist SVG" };
  const s = await env.DB.prepare("SELECT r2_kljuc FROM slike WHERE id = ?").bind(slikaId).first<{ r2_kljuc: string }>();
  if (!s) return { greska: "slika ne postoji" };
  const kljuc = s.r2_kljuc.replace(/\.[a-z]+$/, ".svg");
  await env.SLIKE.put(kljuc, tijelo, { httpMetadata: { contentType: "image/svg+xml" } });
  await env.DB.prepare("UPDATE slike SET svg_kljuc = ? WHERE id = ?").bind(kljuc, slikaId).run();
  await uskladiJavno([slikaId], true);
  return { svgKljuc: kljuc };
}

/** Kvota/rate limit modela: posao natrag u red bez trošenja pokušaja (runner spava do reseta). */
export async function odgodi(posaoId: number, razlog: string) {
  await env.DB.prepare(
    "UPDATE generiranja SET status = 'ceka', pokusaji = MAX(pokusaji - 1, 0), uzeto_at = NULL, greska = ? WHERE id = ? AND status = 'radi'",
  ).bind(razlog.slice(0, 500), posaoId).run();
}

/** Neuspjeh: natrag u red dok ne prijeđe MAX_POKUSAJA, onda 'greska'. */
export async function neuspjeh(posaoId: number, greska: string) {
  await env.DB.prepare(
    `UPDATE generiranja SET greska = ?, status = CASE WHEN pokusaji >= ${MAX_POKUSAJA} THEN 'greska' ELSE 'ceka' END
     WHERE id = ? AND status = 'radi'`,
  ).bind(greska.slice(0, 500), posaoId).run();
}

/** Ishod odluke. `vec` = netko je bio brži: slika više nije kandidat (status i tko je odlučio). */
export type Ishod = { ok: true } | { ok: false; nema?: true; vec?: { status: string; pregledao: string | null } };

/**
 * Odluka o kandidatu. Odobrena istiskuje dosadašnju odobrenu (ona postaje kandidat).
 * Odobri/odbij vrijede samo dok je slika još kandidat: kad dvoje pregledava istovremeno,
 * pamti se prva odluka, a druga dobiva `vec` (uvjetni UPDATE, ne provjera pa upis).
 */
export async function odluci(slikaId: number, akcija: "odobri" | "odbij" | "vrati", email: string, razlog?: string, grupa = novaGrupa()): Promise<Ishod> {
  const db = env.DB;
  const zapis = (radnja: string) => ({ tko: email, radnja, tablica: "slike" as const, grupa });
  const s = await db.prepare("SELECT id, rijec_id, stil_id, status, pregledao FROM slike WHERE id = ?").bind(slikaId)
    .first<{ id: number; rijec_id: number; stil_id: number; status: string; pregledao: string | null }>();
  if (!s) return { ok: false, nema: true };
  // Tko je bio brži: čita se svježe, jer je status iz prvog SELECT-a možda već zastario.
  const vec = async () => {
    const t = await db.prepare("SELECT status, pregledao FROM slike WHERE id = ?").bind(s.id).first<{ status: string; pregledao: string | null }>();
    return { ok: false as const, vec: t ?? { status: s.status, pregledao: s.pregledao } };
  };
  if (akcija !== "vrati" && s.status !== "kandidat") return vec();
  // Slike kojima se mijenja javnost: ova i dosadašnja odobrena (istisnuta postaje kandidat).
  const dirnute = [s.id];
  if (akcija === "odobri") {
    const prije = await db.prepare("SELECT id FROM slike WHERE rijec_id = ? AND stil_id = ? AND status = 'odobrena' AND id != ?")
      .bind(s.rijec_id, s.stil_id, s.id).all<{ id: number }>();
    dirnute.push(...prije.results.map((x) => x.id));
    // Batch je jedna transakcija; oba upita traže da je slika još kandidat, pa kasnija odluka ne mijenja ništa.
    const rez = await db.batch([
      ...zapisSkupa(zapis("slika.istisnuta"),
        { sql: "x.rijec_id = ? AND x.stil_id = ? AND x.status = 'odobrena' AND x.id != ?", args: [s.rijec_id, s.stil_id, s.id] },
        [db.prepare(
          `UPDATE slike SET status = 'kandidat' WHERE rijec_id = ? AND stil_id = ? AND status = 'odobrena'
             AND EXISTS (SELECT 1 FROM slike k WHERE k.id = ? AND k.status = 'kandidat')`,
        ).bind(s.rijec_id, s.stil_id, s.id)]),
      ...sZapisom(zapis("slika.odobrena"), s.id, [
        db.prepare("UPDATE slike SET status = 'odobrena', razlog = NULL, pregledao = ?, pregledano_at = datetime('now') WHERE id = ? AND status = 'kandidat'")
          .bind(email, s.id),
      ]),
    ]);
    if (!rez[rez.length - 3].meta.changes) return vec();
  } else if (akcija === "odbij") {
    const [, r] = await db.batch(sZapisom(zapis("slika.odbijena"), s.id, [
      db.prepare("UPDATE slike SET status = 'odbijena', razlog = ?, pregledao = ?, pregledano_at = datetime('now') WHERE id = ? AND status = 'kandidat'")
        .bind(razlog?.trim().slice(0, 300) || null, email, s.id),
    ]));
    if (!r.meta.changes) return vec();
  } else {
    await db.batch(sZapisom(zapis("slika.u_kandidate"), s.id, [
      db.prepare("UPDATE slike SET status = 'kandidat', pregledao = ?, pregledano_at = datetime('now') WHERE id = ?").bind(email, s.id),
    ]));
  }
  await uskladiJavno(dirnute);
  return { ok: true };
}

/**
 * Odluka s weba ili iz aplikacije. Odbijena s `ponovi`: nova u red (razlog ulazi u prompt), ali
 * samo ako riječ još nema odobrenu sliku ni drugog kandidata. Inače „Odbij” na suvišnom kandidatu
 * stvara novog, i tako u krug (astronaut, 31. 10.).
 */
export async function odluciIPonovi(slikaId: number, akcija: "odobri" | "odbij" | "vrati", email: string, razlog?: string, ponovi = false) {
  const grupa = novaGrupa();
  const ishod = await odluci(slikaId, akcija, email, razlog, grupa);
  let generira = false;
  if (ishod.ok && akcija === "odbij" && ponovi) {
    const s = await env.DB.prepare(
      `SELECT s.rijec_id, s.stil_id, st.kod,
         EXISTS (SELECT 1 FROM slike o WHERE o.rijec_id = s.rijec_id AND o.stil_id = s.stil_id AND o.status IN ('odobrena', 'kandidat')) AS pokrivena
       FROM slike s JOIN stilovi st ON st.id = s.stil_id WHERE s.id = ?`,
    ).bind(slikaId).first<{ rijec_id: number; stil_id: number; kod: string; pokrivena: number }>();
    if (s && !s.pokrivena) generira = (await dodajURed(await stilPoKodu(s.kod), [s.rijec_id], email, undefined, grupa)) > 0;
  }
  return { ...ishod, generira };
}

/** Javni URL odobrene slike (bucket logomedo-javno na cdn.logomedo.com). */
export const javniUrl = (r2Kljuc: string) => `${env.CDN_URL}/${r2Kljuc}`;

/**
 * Javni bucket drži točno odobrene slike, pod istim ključem kao u privatnom.
 * Ključ sadrži hash sadržaja, pa se smije keširati zauvijek; kad slika prestane biti
 * odobrena, briše se i (ako postoji CF_PURGE_TOKEN) čisti iz edge cachea.
 */
export async function uskladiJavno(slikaIds: number[], prepisi = false) {
  for (const id of slikaIds) {
    const s = await env.DB.prepare("SELECT r2_kljuc, svg_kljuc, mime, status FROM slike WHERE id = ?").bind(id)
      .first<{ r2_kljuc: string; svg_kljuc: string | null; mime: string; status: string }>();
    if (!s) continue;
    const datoteke = [{ kljuc: s.r2_kljuc, mime: s.mime }, ...(s.svg_kljuc ? [{ kljuc: s.svg_kljuc, mime: "image/svg+xml" }] : [])];
    for (const d of datoteke) {
      if (s.status === "odobrena") {
        if (!prepisi && (await env.JAVNO.head(d.kljuc))) continue;
        const o = await env.SLIKE.get(d.kljuc);
        if (!o) throw new Error(`nema ${d.kljuc} u privatnom bucketu`);
        await env.JAVNO.put(d.kljuc, o.body, {
          httpMetadata: { contentType: d.mime, cacheControl: "public, max-age=31536000, immutable" },
        });
      } else if (await env.JAVNO.head(d.kljuc)) {
        await env.JAVNO.delete(d.kljuc);
        await ocistiCache(javniUrl(d.kljuc));
      }
    }
  }
}

export async function ocistiCache(url: string) {
  const token = (env as { CF_PURGE_TOKEN?: string }).CF_PURGE_TOKEN;
  if (!token) return console.warn(`CF_PURGE_TOKEN nije postavljen; ${url} ostaje u edge cacheu do isteka`);
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.ZONE_ID}/purge_cache`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ files: [url] }),
  });
  if (!r.ok) console.error(`purge ${url}: HTTP ${r.status} ${await r.text()}`);
}
