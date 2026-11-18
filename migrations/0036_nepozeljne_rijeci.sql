-- Nepoželjne riječi (docs/katalog.md, „Nepoželjne riječi”): riječi koje logoped ne želi u katalogu, s razlogom.
-- Katalog (`rijeci`) je popis dopuštenih; ovo je popis odbijenih, da se ne dodaju ni ne predlažu ponovno.
-- Riječ ne mora postojati u `rijeci` (odbijen prijedlog), pa nema stranog ključa.
CREATE TABLE nepozeljne_rijeci (
  id          INTEGER PRIMARY KEY,
  rijec       TEXT NOT NULL UNIQUE,   -- malim slovima, kao rijeci.rijec
  razlog      TEXT,                   -- „nije za djecu”, „teško se crta”, „imamo već LAĐU”
  dodao       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
