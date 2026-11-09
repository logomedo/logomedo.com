-- Slogovi (docs/zadaci.md, „slogovi”): dugačke i kratke riječi (dvije boje) i slogovna analiza
-- (oboji onoliko krugova koliko riječ ima slogova). Način je parametar sadržaja, kao `trazi` u percepciji.
--
-- Vrsta 'slogovi' u CHECK-u: tablica se slaže ponovno kao u 0022 (djeca sa strane i obrisana
-- prije DROP-a, jer bi implicitni DELETE kaskadom obrisao verzije).
PRAGMA defer_foreign_keys = on;

CREATE TABLE _verzije_sa_strane AS SELECT * FROM zadatak_verzije;
CREATE TABLE _biljeznice_sa_strane AS SELECT * FROM biljeznica_zadaci;
DELETE FROM biljeznica_zadaci;
DELETE FROM zadatak_verzije;

CREATE TABLE zadaci_novo (
  id              INTEGER PRIMARY KEY,
  autor_id        INTEGER NOT NULL REFERENCES korisnici(id),
  vrsta           TEXT NOT NULL CHECK (vrsta IN ('listic', 'odabir', 'povezivanje', 'uljez', 'scena', 'percepcija', 'prvi_glas', 'slogovi')),
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
  stil            TEXT NOT NULL DEFAULT 'ilustracija'
);
INSERT INTO zadaci_novo SELECT id, autor_id, vrsta, podrucje_id, naslov, uputa, vidljivost, izvor_id,
  aktivna_verzija, legacy_path, created_at, updated_at, obrisan_at, stil FROM zadaci;

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


-- Prvi predložak artikulacije: slogovna svjesnost prije vježbanja glasa u dugim riječima.
INSERT INTO podrucja (roditelj_id, naziv, slug, redoslijed)
  SELECT id, 'Slogovi: duljina riječi i slogovna analiza', 'slogovi', 0 FROM podrucja WHERE slug = 'artikulacija';
