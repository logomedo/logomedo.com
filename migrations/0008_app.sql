-- Prijava mobilne aplikacije (docs/app-api.md). Aplikacija otvara /admin/app/prijava u
-- Custom Tabu (postojeća prijava: Access OTP ili passkey), admin potvrdi, Worker vrati
-- jednokratni kod na shemu aplikacije, a aplikacija ga s PKCE verifikatorom zamijeni za token.

-- Jednokratni kodovi: 2 min, vezani uz PKCE izazov (S256). U bazi samo sha-256 koda.
CREATE TABLE app_kodovi (
  kod_hash    TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  izazov      TEXT NOT NULL,            -- base64url(sha256(verifikator)) iz aplikacije
  uredaj      TEXT,                     -- oznaka uređaja koju je aplikacija poslala
  expires_at  TEXT NOT NULL
);

-- Sesije aplikacije: bearer token, u bazi samo sha-256. Uloga se ne sprema nego izvodi pri
-- svakom zahtjevu (admin = e-mail u ADMIN_EMAILS), pa micanje iz popisa odmah gasi pristup.
CREATE TABLE app_sesije (
  token_hash    TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  uredaj        TEXT,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,          -- 30 dana od prijave
  last_seen_at  TEXT NOT NULL           -- 7 dana bez korištenja = gotova
);
CREATE INDEX app_sesije_email ON app_sesije (email);
