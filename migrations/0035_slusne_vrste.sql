-- Slušne vrste (docs/zadaci.md, „koje_slovo” i „pozicija_glasa”): dijete čuje glas (snimka logopedice,
-- docs/zvukovi.md „Snimke glasova”) i dodirne slovo, odnosno krug za početak, sredinu ili kraj riječi.
--
-- Nove vrste u CHECK-u: tablica se slaže ponovno kao u 0022, 0025 i 0034 (djeca sa strane i obrisana
-- prije DROP-a, jer bi implicitni DELETE kaskadom obrisao verzije).
PRAGMA defer_foreign_keys = on;

CREATE TABLE _verzije_sa_strane AS SELECT * FROM zadatak_verzije;
CREATE TABLE _biljeznice_sa_strane AS SELECT * FROM biljeznica_zadaci;
DELETE FROM biljeznica_zadaci;
DELETE FROM zadatak_verzije;

CREATE TABLE zadaci_novo (
  id              INTEGER PRIMARY KEY,
  autor_id        INTEGER NOT NULL REFERENCES korisnici(id),
  vrsta           TEXT NOT NULL CHECK (vrsta IN ('listic', 'odabir', 'povezivanje', 'uljez', 'scena', 'percepcija', 'prvi_glas', 'slogovi', 'razvrstavanje', 'koje_slovo', 'pozicija_glasa')),
  podrucje_id     INTEGER REFERENCES podrucja(id),
  naslov          TEXT NOT NULL DEFAULT '',
  uputa           TEXT,
  vidljivost      TEXT NOT NULL DEFAULT 'privatno' CHECK (vidljivost IN ('privatno', 'dijeljeno', 'javno')),
  izvor_id        INTEGER REFERENCES zadaci(id),   -- kopija tuđeg javnog zadatka
  aktivna_verzija INTEGER NOT NULL DEFAULT 1,
  legacy_path     TEXT,                            -- 'working-sheets/<id>' za uvezene stare listiće
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  obrisan_at      TEXT,
  stil            TEXT NOT NULL DEFAULT 'ilustracija',
  okvir           TEXT
);
INSERT INTO zadaci_novo SELECT id, autor_id, vrsta, podrucje_id, naslov, uputa, vidljivost, izvor_id,
  aktivna_verzija, legacy_path, created_at, updated_at, obrisan_at, stil, okvir FROM zadaci;

DROP TABLE zadaci;
ALTER TABLE zadaci_novo RENAME TO zadaci;
CREATE INDEX zadaci_autor ON zadaci (autor_id, updated_at);
CREATE INDEX zadaci_podrucje ON zadaci (podrucje_id, vrsta);

INSERT INTO zadatak_verzije (zadatak_id, verzija, sadrzaj, created_at)
  SELECT zadatak_id, verzija, sadrzaj, created_at FROM _verzije_sa_strane;
INSERT INTO biljeznica_zadaci (biljeznica_id, zadatak_id, redoslijed)
  SELECT biljeznica_id, zadatak_id, redoslijed FROM _biljeznice_sa_strane;
DROP TABLE _verzije_sa_strane;
DROP TABLE _biljeznice_sa_strane;

-- Povezivanje glasa i slova te mjesto glasa u riječi su fonološke predvještine čitanja i pisanja.
INSERT INTO podrucja (roditelj_id, naziv, slug, redoslijed)
  SELECT id, 'Glas i slovo', 'glas-slovo', 5 FROM podrucja WHERE slug = 'predvjestine';
INSERT INTO podrucja (roditelj_id, naziv, slug, redoslijed)
  SELECT id, 'Mjesto glasa u riječi', 'pozicija-glasa', 6 FROM podrucja WHERE slug = 'predvjestine';
