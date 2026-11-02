-- Vizualna percepcija (docs/zadaci.md, „percepcija”): red sličnih slika (ista slika okrenuta,
-- zrcaljena, siva, manja); dijete pronalazi onu koja se razlikuje ili dvije iste.
--
-- Vrsta 'percepcija' u CHECK-u: tablica se slaže ponovno istim redom kao u 0010 (djeca sa
-- strane i obrisana prije DROP-a, jer bi implicitni DELETE kaskadom obrisao verzije).
PRAGMA defer_foreign_keys = on;

CREATE TABLE _verzije_sa_strane AS SELECT * FROM zadatak_verzije;
CREATE TABLE _biljeznice_sa_strane AS SELECT * FROM biljeznica_zadaci;
DELETE FROM biljeznica_zadaci;
DELETE FROM zadatak_verzije;

CREATE TABLE zadaci_novo (
  id              INTEGER PRIMARY KEY,
  autor_id        INTEGER NOT NULL REFERENCES korisnici(id),
  vrsta           TEXT NOT NULL CHECK (vrsta IN ('listic', 'odabir', 'povezivanje', 'uljez', 'scena', 'percepcija')),
  podrucje_id     INTEGER REFERENCES podrucja(id),
  naslov          TEXT NOT NULL DEFAULT '',
  uputa           TEXT,
  vidljivost      TEXT NOT NULL DEFAULT 'privatno' CHECK (vidljivost IN ('privatno', 'dijeljeno', 'javno')),
  izvor_id        INTEGER REFERENCES zadaci(id),   -- kopija tuđeg javnog zadatka
  aktivna_verzija INTEGER NOT NULL DEFAULT 1,
  legacy_path     TEXT,                            -- 'working-sheets/<id>' za uvezene stare listiće
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  obrisan_at      TEXT
);
INSERT INTO zadaci_novo SELECT id, autor_id, vrsta, podrucje_id, naslov, uputa, vidljivost, izvor_id,
  aktivna_verzija, legacy_path, created_at, updated_at, obrisan_at FROM zadaci;

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

-- Vidna diskriminacija je predvještina čitanja (razlikovanje b/d, p/q počinje na slikama).
INSERT INTO podrucja (roditelj_id, naziv, slug, redoslijed)
  SELECT id, 'Vizualna percepcija', 'vizualna-percepcija', 2 FROM podrucja WHERE slug = 'predvjestine';
