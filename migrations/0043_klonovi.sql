-- Klonovi glasa (docs/klon-glasa.md, /admin/zvukovi/klonovi): govornik pročita odlomke (src/lib/klon-tekst.ts),
-- snimke idu u privatni R2 (`klon/<id>/<hash>.wav`), a „Napravi klon” ih šalje ElevenLabsu (Instant Voice Clone,
-- POST /v1/voices/add). Klon je zatim običan glas računa: pojavi se na /admin/zvukovi/glasovi (probe, odabir).
--
-- Suglasnost govornika je obvezna i pamti se ovdje (ElevenLabs API je ne bilježi).
CREATE TABLE klonovi (
  id              INTEGER PRIMARY KEY,
  ime             TEXT NOT NULL,
  govornik        TEXT NOT NULL,
  suglasnost      TEXT NOT NULL,              -- doslovni tekst izjave koju je govornik potvrdio
  suglasnost_at   TEXT NOT NULL DEFAULT (datetime('now')),
  voice_id        TEXT,                       -- NULL dok klon nije napravljen
  stanje          TEXT NOT NULL DEFAULT 'nacrt' CHECK (stanje IN ('nacrt', 'napravljen', 'obrisan')),
  ukloni_sum      INTEGER NOT NULL DEFAULT 0, -- remove_background_noise pri izradi
  greska          TEXT,
  napravio        TEXT NOT NULL,
  napravljeno_at  TEXT NOT NULL DEFAULT (datetime('now')),
  klonirano_at    TEXT
);

CREATE TABLE klon_uzorci (
  id          INTEGER PRIMARY KEY,
  klon_id     INTEGER NOT NULL REFERENCES klonovi(id),
  odlomak     INTEGER,                        -- indeks u ODLOMCI; NULL = slobodno učitana datoteka
  r2_kljuc    TEXT NOT NULL,
  mime        TEXT NOT NULL,
  trajanje    REAL NOT NULL,
  vrh_db      REAL, rms_db REAL, sum_db REAL, pauza REAL,
  klipova     INTEGER,
  prijepis    TEXT,                           -- Scribe; usporedba s odlomkom
  slicnost    REAL,
  ukljucen    INTEGER NOT NULL DEFAULT 1,     -- ide li u klon
  snimio      TEXT NOT NULL,
  snimljeno_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX klon_uzorci_klon ON klon_uzorci (klon_id);
