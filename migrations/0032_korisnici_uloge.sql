-- Uloge (docs/rbac/): superadmin je e-mail iz ADMIN_EMAILS, logoped je redak u `korisnici`
-- s uloga = 'logoped' i aktivan = 1. Pravilo je u kodu (src/lib/admin/ovlasti.ts odrediUlogu).
-- admin_sessions.method je slobodan TEXT (0001), pa nova metoda 'poziv' ne traži migraciju.

-- Deaktivacija ne briše redak: zadaci i bilježnice ostaju vezani uz autora.
ALTER TABLE korisnici ADD COLUMN aktivan INTEGER NOT NULL DEFAULT 1;
ALTER TABLE korisnici ADD COLUMN deaktiviran_at TEXT;
-- Tjedna AI kvota (klizni prozor 7 dana, ai_potrosnja); superadmin je bez limita.
ALTER TABLE korisnici ADD COLUMN limit_slike_7d INTEGER NOT NULL DEFAULT 50;
ALTER TABLE korisnici ADD COLUMN limit_zvukovi_7d INTEGER NOT NULL DEFAULT 200;

-- Obrana: logoped postaje aktivan samo kroz pozivnicu. Eventualni stari retci 'logoped'
-- (bez pozivnice) ne smiju odjednom dobiti pristup u admin.
UPDATE korisnici SET aktivan = 0, deaktiviran_at = datetime('now') WHERE uloga = 'logoped';

-- Pozivnice: u bazi samo sha-256 tokena iz linka, jednokratne, s istekom.
CREATE TABLE pozivi (
  token_hash     TEXT PRIMARY KEY,
  email          TEXT NOT NULL,
  ime            TEXT,
  korisnik_id    INTEGER REFERENCES korisnici(id),  -- NULL: novi logoped; inače novi passkey postojećem
  stvorio        TEXT NOT NULL,                     -- e-mail superadmina
  created_at     TEXT NOT NULL,
  istjece        TEXT NOT NULL,
  iskoristena_at TEXT,
  opozvana_at    TEXT
);
CREATE INDEX pozivi_email ON pozivi (email);

-- Potrošnja AI-ja po korisniku: zbroj u zadnjih 7 dana uspoređuje se s limitom.
CREATE TABLE ai_potrosnja (
  id          INTEGER PRIMARY KEY,
  korisnik_id INTEGER NOT NULL REFERENCES korisnici(id),
  vrsta       TEXT NOT NULL CHECK (vrsta IN ('slike', 'zvukovi')),
  kolicina    INTEGER NOT NULL,
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  izvor       TEXT                                  -- npr. 'riječ 123', 'situacija 7'
);
CREATE INDEX ai_potrosnja_korisnik ON ai_potrosnja (korisnik_id, vrsta, at);

-- Tko je dodao riječ (e-mail); dosadašnje riječi ostaju NULL.
ALTER TABLE rijeci ADD COLUMN dodao TEXT;
