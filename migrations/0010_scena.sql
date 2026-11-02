-- Scena (docs/zadaci.md, „scena”): pozadinska ilustracija situacije, pitanje (uputa zadatka,
-- čita se naglas) i traka gumba sa slikama iz kataloga; dijete bira sve koji pripadaju.
--
-- Pozadina je situacija (npr. „Hranimo životinje u šumi”) s dvije slike: uspravnom i
-- vodoravnom. Igra prikazuje onu koja odgovara ekranu, a ako postoji samo jedna, nju.
-- Pozadine učitava admin i odmah su javne (bucket logomedo-javno, ključ s hashom), jer nema
-- pregleda kandidata kao kod slika riječi.

CREATE TABLE pozadine (
  id          INTEGER PRIMARY KEY,
  naziv       TEXT NOT NULL,                 -- „Pečemo kolačiće”
  opis        TEXT,                          -- što je na slici (za kasnije generiranje i pretragu)
  autor_id    INTEGER NOT NULL REFERENCES korisnici(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  obrisan_at  TEXT
);

CREATE TABLE pozadina_slike (
  id           INTEGER PRIMARY KEY,
  pozadina_id  INTEGER NOT NULL REFERENCES pozadine(id) ON DELETE CASCADE,
  orijentacija TEXT NOT NULL CHECK (orijentacija IN ('uspravno', 'vodoravno')),
  r2_kljuc     TEXT NOT NULL UNIQUE,         -- 'pozadine/<id>/<hash16>.jpg', i u javnom bucketu
  sha256       TEXT NOT NULL,
  mime         TEXT NOT NULL,
  bajtova      INTEGER NOT NULL,
  sirina       INTEGER NOT NULL,
  visina       INTEGER NOT NULL,
  prompt       TEXT,                         -- kako je nastala (ručni upload iz Geminija i sl.)
  izvor        TEXT NOT NULL DEFAULT 'upload' CHECK (izvor IN ('upload', 'agy')),
  ucitao       TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (pozadina_id, orijentacija)         -- zamjena slike = novi redak umjesto staroga
);

-- Vrsta 'scena' u CHECK-u: SQLite ne mijenja CHECK, pa se tablica slaže ponovno.
-- Djeca (verzije, stavke bilježnica) se prvo spreme sa strane i obrišu: DROP TABLE uz
-- uključene strane ključeve radi implicitni DELETE, koji bi kroz ON DELETE CASCADE obrisao
-- verzije, a povrede od biljeznica_zadaci RENAME ne poništava i COMMIT bi pao.
PRAGMA defer_foreign_keys = on;

CREATE TABLE _verzije_sa_strane AS SELECT * FROM zadatak_verzije;
CREATE TABLE _biljeznice_sa_strane AS SELECT * FROM biljeznica_zadaci;
DELETE FROM biljeznica_zadaci;
DELETE FROM zadatak_verzije;

CREATE TABLE zadaci_novo (
  id              INTEGER PRIMARY KEY,
  autor_id        INTEGER NOT NULL REFERENCES korisnici(id),
  vrsta           TEXT NOT NULL CHECK (vrsta IN ('listic', 'odabir', 'povezivanje', 'uljez', 'scena')),
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

INSERT INTO podrucja (roditelj_id, naziv, slug, redoslijed) VALUES (NULL, 'Razumijevanje i rječnik', 'rjecnik', 3);
INSERT INTO podrucja (roditelj_id, naziv, slug, redoslijed)
  SELECT id, 'Situacije: što pripada', 'situacije', 1 FROM podrucja WHERE slug = 'rjecnik';
