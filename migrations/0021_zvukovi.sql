-- Izgovor (ElevenLabs TTS, docs/zvukovi.md). Snimka pripada tekstu koji igra izgovara (riječ,
-- uputa s riječju, „Bravo…”), ne bilježnici, pa je dijele sve bilježnice s istim tekstom.
-- `kljuc` je tekst malim slovima s jednim razmakom (zvukovi-tekst.ts: kljucZvuka).

-- Svaki pokušaj je redak: odbijeni ostaju (automatski i ljudski), da se vidi što nije valjalo.
CREATE TABLE zvukovi (
  id             INTEGER PRIMARY KEY,
  kljuc          TEXT NOT NULL,
  izgovor        TEXT NOT NULL,                 -- tekst poslan ElevenLabsu
  r2_kljuc       TEXT NOT NULL,                 -- zvuk/<hash>.mp3, isti ključ u SLIKE i (odobren) JAVNO
  mime           TEXT NOT NULL DEFAULT 'audio/mpeg',
  bajtova        INTEGER NOT NULL,
  glas_id        TEXT NOT NULL,
  model          TEXT NOT NULL,
  prijepis       TEXT,                          -- što je Scribe (STT) čuo
  slicnost       REAL,                          -- 0..1 prijepis prema tekstu
  provjera       TEXT NOT NULL CHECK (provjera IN ('ok', 'razlika', 'bez')),
  status         TEXT NOT NULL DEFAULT 'kandidat' CHECK (status IN ('kandidat', 'odobren', 'odbijen')),
  razlog         TEXT,
  pregledao      TEXT,                          -- e-mail ili 'automatski'
  pregledano_at  TEXT,
  posao_id       INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX zvukovi_kljuc ON zvukovi (kljuc, status);
CREATE INDEX zvukovi_status ON zvukovi (status, id);

-- Red: Worker ga obrađuje sam (Cloudflare Queue logomedo-zvukovi), bez runnera na Macu.
CREATE TABLE zvuk_generiranja (
  id           INTEGER PRIMARY KEY,
  kljuc        TEXT NOT NULL,
  izgovor      TEXT NOT NULL,                   -- uz ispravak recenzenta („kako treba izgovoriti”)
  status       TEXT NOT NULL DEFAULT 'ceka' CHECK (status IN ('ceka', 'radi', 'gotovo', 'greska')),
  pokusaji     INTEGER NOT NULL DEFAULT 0,      -- svaki TTS poziv; STT razlika = novi pokušaj
  greska       TEXT,
  zvuk_id      INTEGER,
  zatrazio     TEXT NOT NULL,
  uzeto_at     TEXT,
  zavrseno_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX zvuk_generiranja_red ON zvuk_generiranja (status, id);
CREATE INDEX zvuk_generiranja_kljuc ON zvuk_generiranja (kljuc, status);

INSERT INTO postavke (kljuc, vrijednost) VALUES
  ('zvuk_glas', ''),
  ('zvuk_model', 'eleven_v3');
