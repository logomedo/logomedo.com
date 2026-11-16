-- S2 (docs/rbac/): pozivnice i upravljanje korisnicima.
--
-- 1. `pozivi` dobiva cjelobrojni `id` (stranica /admin/korisnici i dnevnik aktivnosti rade s njim,
--    hash tokena nikad ne izlazi iz baze) i `passkey_id`: koji je passkey potrošio pozivnicu. Po njemu
--    ostale naredbe istog batcha znaju da je baš ovaj zahtjev potrošio pozivnicu (dva istodobna
--    pokušaja: samo jedan stvori korisnika i passkey; src/lib/admin/pozivi.ts). Tablica je do S2
--    prazna (ništa u nju nije pisalo), ali se svejedno prepisuje sa sadržajem.
CREATE TABLE pozivi_novi (
  id             INTEGER PRIMARY KEY,
  token_hash     TEXT NOT NULL UNIQUE,
  email          TEXT NOT NULL,
  ime            TEXT,
  korisnik_id    INTEGER REFERENCES korisnici(id),  -- NULL: novi logoped; inače novi passkey postojećem
  stvorio        TEXT NOT NULL,                     -- e-mail superadmina
  created_at     TEXT NOT NULL,
  istjece        TEXT NOT NULL,
  iskoristena_at TEXT,
  passkey_id     TEXT,                              -- admin_passkeys.id nastao iz ove pozivnice
  opozvana_at    TEXT
);
INSERT INTO pozivi_novi (token_hash, email, ime, korisnik_id, stvorio, created_at, istjece, iskoristena_at, opozvana_at)
  SELECT token_hash, email, ime, korisnik_id, stvorio, created_at, istjece, iskoristena_at, opozvana_at FROM pozivi;
DROP TABLE pozivi;
ALTER TABLE pozivi_novi RENAME TO pozivi;
CREATE INDEX pozivi_email ON pozivi (email);

-- 2. `aktivnost.tablica` smije i 'korisnici' i 'pozivi' (CHECK se u SQLiteu ne mijenja: nova tablica,
--    prepis, zamjena). Ti zapisi se ne poništavaju (src/lib/aktivnost.ts vrati()).
--    Samoreferenca piše `aktivnost_nova`, pa DROP stare tablice ne krši strani ključ, a RENAME je
--    prepiše u `aktivnost`.
CREATE TABLE aktivnost_nova (
  id        INTEGER PRIMARY KEY,
  at        TEXT NOT NULL DEFAULT (datetime('now')),
  tko       TEXT NOT NULL,
  radnja    TEXT NOT NULL,
  tablica   TEXT NOT NULL CHECK (tablica IN ('rijeci', 'slike', 'generiranja', 'biljeznice', 'korisnici', 'pozivi')),
  redak_id  INTEGER,
  grupa     TEXT NOT NULL,
  prije     TEXT,
  poslije   TEXT,
  vraca_id  INTEGER REFERENCES aktivnost_nova(id),
  rijec_id  INTEGER GENERATED ALWAYS AS (
    CASE tablica WHEN 'rijeci' THEN redak_id ELSE json_extract(COALESCE(poslije, prije), '$.rijec_id') END
  ) VIRTUAL
);
INSERT INTO aktivnost_nova (id, at, tko, radnja, tablica, redak_id, grupa, prije, poslije, vraca_id)
  SELECT id, at, tko, radnja, tablica, redak_id, grupa, prije, poslije, vraca_id FROM aktivnost ORDER BY id;
DROP TABLE aktivnost;
ALTER TABLE aktivnost_nova RENAME TO aktivnost;
CREATE INDEX aktivnost_redak ON aktivnost (tablica, redak_id, id);
CREATE INDEX aktivnost_grupa ON aktivnost (grupa);
CREATE INDEX aktivnost_rijec ON aktivnost (rijec_id, id);
CREATE INDEX aktivnost_tko ON aktivnost (tko, id);
