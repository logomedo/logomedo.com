-- Kuponi na /pristup (docs/kuponi.md): kod koji osoba upiše u obrazac (ili dobije u linku /pristup?kupon=KOD).
-- `auto_odobri = 1`: zahtjev s važećim kuponom odobrava se sam, odmah (pozivnica e-poštom, bez klika „Odobri”).
-- Uz kupon može ići i pogodnost nakon bete (kao uz ručno „Odobri”, 0045). Ograničenja: najviše `max_koristenja`
-- odobrenja (NULL = bez ograničenja) i `vrijedi_do` (NULL = bez isteka). `iskoristen` broji samo auto-odobrene.
-- Nevaljao ili neaktivan kupon ne daje grešku (da se kodovi ne mogu pogađati mimo limita po IP-u): zahtjev se spremi
-- kao običan, s upisanim kodom, i čeka ručnu obradu.
CREATE TABLE kuponi (
  id             INTEGER PRIMARY KEY,
  kod            TEXT NOT NULL UNIQUE,              -- velikim slovima, [A-Z0-9-], 4–32
  opis           TEXT,                              -- samo za superadmina, npr. „predavanje u Splitu”
  auto_odobri    INTEGER NOT NULL DEFAULT 1 CHECK (auto_odobri IN (0, 1)),
  vrsta          TEXT CHECK (vrsta IS NULL OR vrsta IN ('mjeseci', 'trajno')),
  mjeseci        INTEGER CHECK ((vrsta IS NULL AND mjeseci IS NULL) OR (vrsta = 'mjeseci' AND mjeseci BETWEEN 1 AND 36)
                   OR (vrsta = 'trajno' AND mjeseci IS NULL)),
  max_koristenja INTEGER CHECK (max_koristenja IS NULL OR max_koristenja >= 1),
  iskoristen     INTEGER NOT NULL DEFAULT 0,
  vrijedi_do     TEXT,                              -- ISO; NULL = bez isteka
  aktivan        INTEGER NOT NULL DEFAULT 1 CHECK (aktivan IN (0, 1)),
  stvorio        TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
-- Kod koji je osoba upisala u obrazac (i kad ne vrijedi), da ga superadmin vidi na /admin/zahtjevi.
ALTER TABLE zahtjevi_pristupa ADD COLUMN kupon TEXT;
