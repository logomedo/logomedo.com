-- Zadaci (docs/zadaci.md): vrsta je kod (src/lib/zadaci/vrste.ts), zadatak je instanca s
-- JSON sadržajem, a svaka promjena nakon prvog rješavanja daje novu verziju.

-- Stablo područja rada: područje → podpodručje.
CREATE TABLE podrucja (
  id          INTEGER PRIMARY KEY,
  roditelj_id INTEGER REFERENCES podrucja(id),
  naziv       TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  opis        TEXT,
  redoslijed  INTEGER NOT NULL DEFAULT 0
);
INSERT INTO podrucja (id, roditelj_id, naziv, slug, redoslijed) VALUES
  (1, NULL, 'Korekcija artikulacije', 'artikulacija', 1),
  (2, NULL, 'Predvještine čitanja i pisanja', 'predvjestine', 2),
  (3, 2, 'Prepoznavanje rime', 'rima', 1),
  (4, 1, 'Radni listići', 'listici', 1);

-- Logopedi i admini. Admin prijava je i dalje admin_sessions (ADMIN_EMAILS); ovdje je samo
-- identitet autora zadatka, upisan pri prvom spremanju.
CREATE TABLE korisnici (
  id         INTEGER PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  ime        TEXT,
  uloga      TEXT NOT NULL DEFAULT 'logoped' CHECK (uloga IN ('logoped', 'admin')),
  legacy_uid TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE zadaci (
  id              INTEGER PRIMARY KEY,
  autor_id        INTEGER NOT NULL REFERENCES korisnici(id),
  vrsta           TEXT NOT NULL CHECK (vrsta IN ('listic', 'odabir', 'povezivanje', 'uljez')),
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
CREATE INDEX zadaci_autor ON zadaci (autor_id, updated_at);
CREATE INDEX zadaci_podrucje ON zadaci (podrucje_id, vrsta);

-- Nepromjenjiv snapshot sadržaja. Dok verziju nitko nije rješavao, uređuje se na mjestu.
CREATE TABLE zadatak_verzije (
  zadatak_id INTEGER NOT NULL REFERENCES zadaci(id) ON DELETE CASCADE,
  verzija    INTEGER NOT NULL,
  sadrzaj    TEXT NOT NULL CHECK (json_valid(sadrzaj)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (zadatak_id, verzija)
);

-- Djeca nemaju račun: pripadaju jednom logopedu, rješavaju na njegovom uređaju.
-- Minimum podataka (GDPR čl. 9): nadimak ili šifra, bez punog imena i OIB-a.
CREATE TABLE djeca (
  id             INTEGER PRIMARY KEY,
  logoped_id     INTEGER NOT NULL REFERENCES korisnici(id),
  nadimak        TEXT NOT NULL,
  godina_rodenja INTEGER,
  napomena       TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  arhivirano_at  TEXT
);
CREATE INDEX djeca_logoped ON djeca (logoped_id);

CREATE TABLE rjesavanja (
  id          INTEGER PRIMARY KEY,
  logoped_id  INTEGER NOT NULL REFERENCES korisnici(id),  -- tko je vodio sat
  dijete_id   INTEGER NOT NULL REFERENCES djeca(id),
  zadatak_id  INTEGER NOT NULL,
  verzija     INTEGER NOT NULL,
  odgovori    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(odgovori)),
  tocnih      INTEGER,
  ukupno      INTEGER,
  zapoceto_at TEXT NOT NULL DEFAULT (datetime('now')),
  zavrseno_at TEXT,
  FOREIGN KEY (zadatak_id, verzija) REFERENCES zadatak_verzije(zadatak_id, verzija)
);
CREATE INDEX rjesavanja_dijete ON rjesavanja (dijete_id, zapoceto_at);
CREATE INDEX rjesavanja_zadatak ON rjesavanja (zadatak_id, verzija);

-- Rima: NULL = izvedi iz pravopisa (src/lib/zadaci/rima.ts); upisano = admin je ispravio.
ALTER TABLE rijeci ADD COLUMN rima TEXT;
