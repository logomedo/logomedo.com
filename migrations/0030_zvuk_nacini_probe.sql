-- Načini izgovora (docs/zvukovi.md „Kratke riječi”): eleven_v4 kratku riječ čita engleski, pa
-- svaka snimka pamti kojim je načinom nastala („eleven_multilingual_v2+kontekst” …).
ALTER TABLE zvukovi ADD COLUMN nacin TEXT;
UPDATE zvukovi SET nacin = model WHERE nacin IS NULL;
-- Nakon ljudskog odbijanja posao snimi sve načine odjednom, a čovjek bira najbolju.
ALTER TABLE zvuk_generiranja ADD COLUMN varijante INTEGER NOT NULL DEFAULT 0;

-- Probe glasova (/admin/zvukovi/glasovi): trajno, s ocjenom i napomenom, za usporedbu glasova i
-- regresiju na stalnom testnom skupu. Jedna proba = glas × način × tekst; mp3 je u R2 (SLIKE).
CREATE TABLE zvuk_probe (
  id             INTEGER PRIMARY KEY,
  glas_id        TEXT NOT NULL,
  glas_ime       TEXT,
  nacin          TEXT NOT NULL,
  tekst          TEXT NOT NULL,
  r2_kljuc       TEXT NOT NULL,
  prijepis       TEXT,
  slicnost       REAL,
  ocjena         INTEGER CHECK (ocjena IN (-1, 1)),   -- 1 dobar, -1 loš, NULL neocijenjeno
  napomena       TEXT,
  ocijenio       TEXT,
  ocijenjeno_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (glas_id, nacin, tekst)
);
CREATE INDEX zvuk_probe_glas ON zvuk_probe (glas_id, nacin);
