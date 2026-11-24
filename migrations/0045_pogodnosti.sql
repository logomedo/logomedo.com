-- Pogodnosti (docs/pogodnosti.md, landing odluka 815): što je superadmin privatno obećao korisniku za razdoblje nakon
-- bete, npr. „3 mjeseca besplatno” ili „trajno besplatno”. Nije kupon platnog servisa: to je pravo na pristup bez
-- plaćanja, po e-mailu (može se dodijeliti i prije nego račun postoji, uz „Odobri” na /admin/zahtjevi).
-- Dok traje beta, ništa se ne provodi; checkout će je čitati. Mjeseci se broje od početka naplate, ne od dodjele.
-- Povijest se čuva: promjena ili uklanjanje opoziva stari redak (opozvana_at) i po potrebi upiše novi.
CREATE TABLE pogodnosti (
  id          INTEGER PRIMARY KEY,
  email       TEXT NOT NULL,                       -- malim slovima
  vrsta       TEXT NOT NULL CHECK (vrsta IN ('mjeseci', 'trajno')),
  mjeseci     INTEGER CHECK ((vrsta = 'mjeseci' AND mjeseci IS NOT NULL AND mjeseci BETWEEN 1 AND 36) OR (vrsta = 'trajno' AND mjeseci IS NULL)),
  napomena    TEXT,                                -- samo za superadmina, npr. „recenzentica slika”
  dodijelio   TEXT NOT NULL,                       -- e-mail superadmina
  created_at  TEXT NOT NULL,
  opozvana_at TEXT,
  opozvao     TEXT
);
-- Najviše jedna važeća po e-mailu.
CREATE UNIQUE INDEX pogodnosti_vazeca ON pogodnosti (email) WHERE opozvana_at IS NULL;
