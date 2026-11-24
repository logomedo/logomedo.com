-- Uređaji po računu (docs/uredaji.md): protiv dijeljenja jednog računa među više ljudi.
-- Uređaj = preglednik s kolačićem `__Host-logomedo_uredaj` (nasumičan, 400 dana); u bazi samo sha-256.
-- Tabovi i prozori istog preglednika su jedan uređaj. Aktivan = zahtjev u zadnjih 15 min i nije odjavljen.
CREATE TABLE uredaji (
  id          INTEGER PRIMARY KEY,
  email       TEXT NOT NULL,              -- malim slovima
  kljuc_hash  TEXT NOT NULL,
  naziv       TEXT NOT NULL,              -- "Chrome · Windows"
  created_at  TEXT NOT NULL,
  zadnji_put  TEXT NOT NULL,
  grad        TEXT,                       -- request.cf (zadnje viđeno)
  drzava      TEXT,
  mreza       TEXT,                       -- AS organizacija, npr. "Hrvatski Telekom"
  mreza_hash  TEXT,                       -- sha-256 /24 (IPv4) ili /48 (IPv6), skraćen; puna IP se ne sprema
  odjavljen_at TEXT,                      -- drugi uređaj ga je preuzeo ili ga je korisnik odjavio
  odjavio_id  INTEGER,                    -- uredaji.id koji je preuzeo (NULL = sam korisnik ili superadmin)
  UNIQUE (email, kljuc_hash)
);
CREATE INDEX uredaji_email ON uredaji (email, zadnji_put);

-- Dnevnik za pregled superadmina (sumnja na dijeljenje), čuva se 180 dana.
CREATE TABLE uredaji_dogadaji (
  id         INTEGER PRIMARY KEY,
  email      TEXT NOT NULL,
  uredaj_id  INTEGER NOT NULL,
  vrsta      TEXT NOT NULL CHECK (vrsta IN ('novi', 'mreza', 'preuzimanje', 'previse', 'odjava')),
  drugi_id   INTEGER,                     -- preuzimanje/odjava: koji je uređaj odjavljen
  grad       TEXT,
  mreza      TEXT,
  mreza_hash TEXT,
  at         TEXT NOT NULL
);
CREATE INDEX uredaji_dogadaji_email ON uredaji_dogadaji (email, at);

-- Najviše istovremeno aktivnih uređaja. NULL = zadano (logoped 2, superadmin bez limita).
ALTER TABLE korisnici ADD COLUMN limit_uredaja INTEGER;
