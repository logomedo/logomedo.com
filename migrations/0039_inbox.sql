-- Inbox (docs/inbox/): odgovori na transakcijske mailove stižu kroz Resend webhook (src/pages/api/resend/webhook.ts)
-- i spremaju se ovdje; superadmin ih čita i odgovara na /admin/poruke. Logika: src/lib/poruke.ts.
--
-- Razgovor je nit s jednim sugovornikom. `kljuc` (nasumičan, base32, bez PII) je u adresi za odgovor
-- odgovor+<kljuc>@poruke.logomedo.com i drži nit (odluka 4). `neprocitano` je broj dolaznih poruka bez
-- `procitano_at` (održava ga poruke.ts, da popis i brojač ne broje poruke).
-- Sadržaj poruka je osobni podatak: samo superadmin, nikad u `aktivnost` ni logove.
CREATE TABLE razgovori (
  id          INTEGER PRIMARY KEY,
  kljuc       TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,                         -- sugovornik, normaliziran (trim, mala slova)
  ime         TEXT,
  korisnik_id INTEGER REFERENCES korisnici(id) ON DELETE SET NULL,
  predmet     TEXT,
  zadnja_at   TEXT NOT NULL,                         -- vrijeme zadnje poruke (ulaz ili izlaz)
  neprocitano INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'otvoren' CHECK (status IN ('otvoren', 'zatvoren', 'nerasporedjen')),
  created_at  TEXT NOT NULL
);
CREATE INDEX razgovori_zadnja ON razgovori (zadnja_at DESC);
CREATE INDEX razgovori_neprocitano ON razgovori (neprocitano, zadnja_at DESC) WHERE neprocitano > 0;
CREATE INDEX razgovori_email ON razgovori (email, zadnja_at DESC);

-- `resend_id`: dolazna = `email_id` iz webhooka (idempotencija), odlazna = id iz `POST /emails`.
-- `reference`: Message-ID-jevi iz In-Reply-To i References dolaznog maila, odvojeni razmakom.
-- `tijelo_fali` = 1 kad tijelo nije dohvaćeno (nema RESEND_API_KEY); `napomena` za skraćen tekst i sl.
CREATE TABLE poruke (
  id           INTEGER PRIMARY KEY,
  razgovor_id  INTEGER NOT NULL REFERENCES razgovori(id) ON DELETE CASCADE,
  smjer        TEXT NOT NULL CHECK (smjer IN ('ulaz', 'izlaz')),
  resend_id    TEXT UNIQUE,
  message_id   TEXT,
  in_reply_to  TEXT,
  reference    TEXT,
  od           TEXT NOT NULL,
  za           TEXT NOT NULL,                        -- adrese odvojene zarezom
  predmet      TEXT,
  text         TEXT,
  html         TEXT,
  tijelo_fali  INTEGER NOT NULL DEFAULT 0,
  napomena     TEXT,
  created_at   TEXT NOT NULL,
  procitano_at TEXT,
  poslao       TEXT                                  -- e-mail superadmina (samo 'izlaz')
);
CREATE INDEX poruke_razgovor ON poruke (razgovor_id, created_at);
CREATE INDEX poruke_message_id ON poruke (message_id) WHERE message_id IS NOT NULL;

-- Privitak u R2 `SLIKE` pod `poruke/<resend email_id>/<resend attachment id>` (privatno, odluka 6).
-- `r2_kljuc` NULL: privitak nije spremljen (`napomena`: prevelik, tip nije dopušten), ime i tip ostaju.
CREATE TABLE privitci (
  id        INTEGER PRIMARY KEY,
  poruka_id INTEGER NOT NULL REFERENCES poruke(id) ON DELETE CASCADE,
  r2_kljuc  TEXT,
  ime       TEXT NOT NULL,
  tip       TEXT NOT NULL,
  velicina  INTEGER,
  content_id TEXT,                                   -- za `cid:` slike u HTML-u
  napomena  TEXT
);
CREATE INDEX privitci_poruka ON privitci (poruka_id);

CREATE TABLE brzi_odgovori (
  id         INTEGER PRIMARY KEY,
  kratica    TEXT NOT NULL UNIQUE,
  naslov     TEXT NOT NULL,
  tekst      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
