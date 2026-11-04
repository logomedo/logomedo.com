-- Situacije (pozadine scena): iz uspravne slike izgeneriraj vodoravnu i obrnuto. Isti lokalni
-- runner kao za slike riječi (/api/runner/uzmi daje ove poslove prve), ali zaseban red jer
-- `generiranja` pripada riječima (rijec_id NOT NULL). Postojeća slika ide modelu kao predložak.
CREATE TABLE pozadina_generiranja (
  id           INTEGER PRIMARY KEY,
  pozadina_id  INTEGER NOT NULL REFERENCES pozadine(id) ON DELETE CASCADE,
  iz           TEXT NOT NULL CHECK (iz IN ('uspravno', 'vodoravno')),   -- slika koja postoji
  u            TEXT NOT NULL CHECK (u IN ('uspravno', 'vodoravno')),    -- slika koja nastaje
  izvor_kljuc  TEXT NOT NULL,                                          -- r2_kljuc predloška (javni bucket)
  aspekt       TEXT NOT NULL,                                          -- '4:3', '16:9'…
  prompt       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ceka' CHECK (status IN ('ceka', 'radi', 'gotovo', 'greska')),
  pokusaji     INTEGER NOT NULL DEFAULT 0,
  uzeto_at     TEXT,
  zavrseno_at  TEXT,
  greska       TEXT,
  zatrazio     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX pozadina_generiranja_red ON pozadina_generiranja (status, id);
CREATE INDEX pozadina_generiranja_pozadina ON pozadina_generiranja (pozadina_id, id);
