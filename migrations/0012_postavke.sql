-- Postavke koje admin mijenja u /admin/prompt: sistemski prompt (dodaje se na svaki posao
-- u trenutku kad ga runner uzme, pa vrijedi i za poslove koji već čekaju) i pauza reda.
CREATE TABLE postavke (
  kljuc          TEXT PRIMARY KEY,
  vrijednost     TEXT NOT NULL,
  izmijenio      TEXT,
  izmijenjeno_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Svaka izmjena postavke ili predloška stila (kljuc 'predlozak:<kod>'); samo se dodaje.
CREATE TABLE postavke_povijest (
  id         INTEGER PRIMARY KEY,
  kljuc      TEXT NOT NULL,
  vrijednost TEXT NOT NULL,
  izmijenio  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX postavke_povijest_kljuc ON postavke_povijest (kljuc, id);

INSERT INTO postavke (kljuc, vrijednost) VALUES
  ('sistemski_prompt', 'Only people and animals may have faces. Never draw eyes, mouths, smiles or faces on objects, food, plants, buildings, vehicles, clothing, weather or natural phenomena such as smoke, clouds, the sun or the moon.'),
  ('red_pauza', '0');

-- Sistemski prompt kakav je bio kad je runner uzeo posao (ide u slike.prompt uz prompt posla).
ALTER TABLE generiranja ADD COLUMN sistemski TEXT;
