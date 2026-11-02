-- Teme bilježnica (src/lib/teme.ts): uz božić i „proljeće” (dnevno nebo, jabuka s plodovima).
-- CHECK se u SQLite ne mijenja, pa se `biljeznice` slaže ponovno, istim redom kao `zadaci`
-- u 0010: stavke (biljeznica_zadaci, ON DELETE CASCADE) prvo sa strane i obrisati, pa vratiti.
PRAGMA defer_foreign_keys = on;

CREATE TABLE _stavke_sa_strane AS SELECT * FROM biljeznica_zadaci;
DELETE FROM biljeznica_zadaci;

CREATE TABLE biljeznice_novo (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,            -- javna poveznica /b/<slug>
  naslov      TEXT NOT NULL,
  podnaslov   TEXT,
  tema        TEXT NOT NULL DEFAULT 'bozic' CHECK (tema IN ('bozic', 'proljece')),
  stil        TEXT NOT NULL DEFAULT 'ilustracija',  -- koji stil slika prikazuje (pada na bojanku)
  javna       INTEGER NOT NULL DEFAULT 1,
  autor_id    INTEGER NOT NULL REFERENCES korisnici(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO biljeznice_novo (id, slug, naslov, podnaslov, tema, stil, javna, autor_id, created_at, updated_at)
  SELECT id, slug, naslov, podnaslov, tema, stil, javna, autor_id, created_at, updated_at FROM biljeznice;

DROP TABLE biljeznice;
ALTER TABLE biljeznice_novo RENAME TO biljeznice;

INSERT INTO biljeznica_zadaci (biljeznica_id, zadatak_id, redoslijed)
  SELECT biljeznica_id, zadatak_id, redoslijed FROM _stavke_sa_strane;
DROP TABLE _stavke_sa_strane;
