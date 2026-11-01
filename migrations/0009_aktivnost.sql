-- Dnevnik aktivnosti admina i runnera (docs/aktivnost.md). Svaka izmjena kataloga upisuje redak
-- sa snimkom retka prije i poslije, u istoj transakciji kao i sama izmjena (src/lib/aktivnost.ts).
-- „Poništi” i „Vrati na ovo” ne brišu povijest: primijene snimak i upišu novi redak.
CREATE TABLE aktivnost (
  id        INTEGER PRIMARY KEY,
  at        TEXT NOT NULL DEFAULT (datetime('now')),
  tko       TEXT NOT NULL,             -- e-mail admina ili 'runner'
  radnja    TEXT NOT NULL,             -- 'slika.odobrena', 'rijec.uredena', 'generiranje.zatrazeno'…
  tablica   TEXT NOT NULL CHECK (tablica IN ('rijeci', 'slike', 'generiranja', 'biljeznice')),
  redak_id  INTEGER,                   -- NULL samo dok se novi redak ne upiše (unutar iste transakcije)
  grupa     TEXT NOT NULL,             -- jedna radnja korisnika (odobri = ova slika + istisnuta); poništava se zajedno
  prije     TEXT,                      -- JSON snimak; NULL = redak je nastao
  poslije   TEXT,                      -- JSON snimak; NULL = redak je obrisan
  vraca_id  INTEGER REFERENCES aktivnost(id), -- zapis koji je ova izmjena poništila ili vratila
  -- Riječ na koju se zapis odnosi, za povijest na stranici riječi.
  rijec_id  INTEGER GENERATED ALWAYS AS (
    CASE tablica WHEN 'rijeci' THEN redak_id ELSE json_extract(COALESCE(poslije, prije), '$.rijec_id') END
  ) VIRTUAL
);
CREATE INDEX aktivnost_redak ON aktivnost (tablica, redak_id, id);
CREATE INDEX aktivnost_grupa ON aktivnost (grupa);
CREATE INDEX aktivnost_rijec ON aktivnost (rijec_id, id);
CREATE INDEX aktivnost_tko ON aktivnost (tko, id);
