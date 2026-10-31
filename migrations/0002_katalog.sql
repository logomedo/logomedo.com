-- Katalog slika po glasovima (docs/katalog.md). Riječ može biti pod više glasova i
-- pozicija (KRASTAVAC: R skupina, S medijalna, C finalna); slike su po riječi i stilu.

CREATE TABLE glasovi (
  id          INTEGER PRIMARY KEY,
  oznaka      TEXT NOT NULL UNIQUE,      -- 'Č', 'DŽ'
  slug        TEXT NOT NULL UNIQUE,      -- 'ch' (URL)
  skupina     TEXT,                      -- 'sibilanti' | 'šuštavci' | 'likvidi'
  skupine     INTEGER NOT NULL DEFAULT 0, -- 1 = ima poziciju „konsonantske skupine” (R)
  redoslijed  INTEGER NOT NULL,
  opis        TEXT
);

CREATE TABLE rijeci (
  id               INTEGER PRIMARY KEY,
  rijec            TEXT NOT NULL UNIQUE,  -- malim slovima; velika radi CSS
  slug             TEXT NOT NULL UNIQUE,
  opis_za_sliku    TEXT,                  -- homonimi: LUK = povrće, ne oružje; ide u prompt
  recenica         TEXT,                  -- primjer s listića: „VRABAC CVRKUĆE NA GRANI”
  legacy_koristeno INTEGER NOT NULL DEFAULT 0, -- koliko puta na starim listićima
  izvor            TEXT NOT NULL DEFAULT 'admin' CHECK (izvor IN ('legacy', 'admin')),
  aktivna          INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE rijec_glas (
  rijec_id   INTEGER NOT NULL REFERENCES rijeci(id) ON DELETE CASCADE,
  glas_id    INTEGER NOT NULL REFERENCES glasovi(id),
  pozicija   TEXT NOT NULL CHECK (pozicija IN ('inicijalna', 'medijalna', 'finalna', 'skupina')),
  potvrdeno  INTEGER NOT NULL DEFAULT 0, -- 1 = stari katalog ili logoped; 0 = izvedeno iz pravopisa
  PRIMARY KEY (rijec_id, glas_id, pozicija)
);
CREATE INDEX rijec_glas_glas ON rijec_glas (glas_id, pozicija);

-- Stil slike s promptom. {rijec}, {opis} i {napomena} se zamjenjuju (src/lib/prompt.ts).
CREATE TABLE stilovi (
  id         INTEGER PRIMARY KEY,
  kod        TEXT NOT NULL UNIQUE,       -- 'bojanka'
  naziv      TEXT NOT NULL,
  predlozak  TEXT NOT NULL,
  model      TEXT NOT NULL DEFAULT 'gemini-3.8-flash-low',
  aktivan    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE slike (
  id            INTEGER PRIMARY KEY,
  rijec_id      INTEGER NOT NULL REFERENCES rijeci(id) ON DELETE CASCADE,
  stil_id       INTEGER NOT NULL REFERENCES stilovi(id),
  r2_kljuc      TEXT NOT NULL UNIQUE,    -- 'bojanka/krastavac/42.png'
  sha256        TEXT NOT NULL,
  mime          TEXT NOT NULL,
  bajtova       INTEGER NOT NULL,
  prompt        TEXT,                    -- točno ono što je otišlo modelu
  model         TEXT,
  izvor         TEXT NOT NULL CHECK (izvor IN ('agy', 'upload')),
  status        TEXT NOT NULL DEFAULT 'kandidat' CHECK (status IN ('kandidat', 'odobrena', 'odbijena')),
  razlog        TEXT,                    -- zašto odbijena; ulazi u napomenu sljedećeg generiranja
  pregledao     TEXT,
  pregledano_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX slike_rijec ON slike (rijec_id, stil_id, status);
CREATE INDEX slike_status ON slike (status, id);
-- Najviše jedna odobrena slika po riječi i stilu.
CREATE UNIQUE INDEX slike_odobrena ON slike (rijec_id, stil_id) WHERE status = 'odobrena';

-- Red za lokalni runner (scripts/runner.sh: tmux + agy). 'radi' stariji od 15 min
-- vraća se u 'ceka' pri sljedećem uzimanju.
CREATE TABLE generiranja (
  id          INTEGER PRIMARY KEY,
  rijec_id    INTEGER NOT NULL REFERENCES rijeci(id) ON DELETE CASCADE,
  stil_id     INTEGER NOT NULL REFERENCES stilovi(id),
  prompt      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ceka' CHECK (status IN ('ceka', 'radi', 'gotovo', 'greska')),
  pokusaji    INTEGER NOT NULL DEFAULT 0,
  uzeto_at    TEXT,
  zavrseno_at TEXT,
  greska      TEXT,
  slika_id    INTEGER REFERENCES slike(id),
  zatrazio    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX generiranja_red ON generiranja (status, id);
CREATE INDEX generiranja_rijec ON generiranja (rijec_id, status);
