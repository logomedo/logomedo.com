-- Verzije sistemskog prompta i predložaka stilova (docs/prompt-iteracije.md). Svaki posao pamti
-- s kojom je verzijom nastao, pa /admin/prompt za svaku verziju pokaže koliko je slika odobreno
-- i odbijeno. Aktivna verzija se mijenja jednim klikom („Aktiviraj”), bez brisanja ičega.
CREATE TABLE prompt_verzije (
  id         INTEGER PRIMARY KEY,
  kljuc      TEXT NOT NULL,              -- 'sistemski_prompt' | 'predlozak:<kod stila>'
  broj       INTEGER NOT NULL,           -- v1, v2… unutar ključa
  tekst      TEXT NOT NULL,
  biljeska   TEXT,                       -- zašto je nastala: koje primjedbe rješava
  autor      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kljuc, broj)
);

ALTER TABLE postavke ADD COLUMN verzija_id INTEGER REFERENCES prompt_verzije(id);
ALTER TABLE stilovi ADD COLUMN predlozak_verzija INTEGER REFERENCES prompt_verzije(id);
ALTER TABLE generiranja ADD COLUMN sistemski_verzija INTEGER REFERENCES prompt_verzije(id);
ALTER TABLE generiranja ADD COLUMN predlozak_verzija INTEGER REFERENCES prompt_verzije(id);

-- Dosadašnje verzije iz postavke_povijest (redom, bez uzastopnih duplikata). Prvi sistemski
-- prompt je onaj iz migracije 0012; predlošci počinju trenutačnim tekstom iz migracija 0002/0007.
INSERT INTO prompt_verzije (kljuc, broj, tekst, biljeska, autor, created_at)
SELECT 'sistemski_prompt', 1,
  'Only people and animals may have faces. Never draw eyes, mouths, smiles or faces on objects, food, plants, buildings, vehicles, clothing, weather or natural phenomena such as smoke, clouds, the sun or the moon.',
  'Početna verzija (migracija 0012): smajlići na dimu i dimnjaku.', NULL, '2026-11-02 15:00:00';

INSERT INTO prompt_verzije (kljuc, broj, tekst, biljeska, autor, created_at)
SELECT 'sistemski_prompt', 1 + ROW_NUMBER() OVER (ORDER BY id), vrijednost, 'Izmjena na /admin/prompt.', izmijenio, created_at
FROM postavke_povijest
WHERE kljuc = 'sistemski_prompt'
  AND vrijednost <> 'Only people and animals may have faces. Never draw eyes, mouths, smiles or faces on objects, food, plants, buildings, vehicles, clothing, weather or natural phenomena such as smoke, clouds, the sun or the moon.';

INSERT INTO prompt_verzije (kljuc, broj, tekst, biljeska, created_at)
SELECT 'predlozak:' || kod, 1, predlozak, 'Početna verzija (migracije 0002 i 0007).', '2026-10-31 00:00:00' FROM stilovi;

UPDATE postavke SET verzija_id = (
  SELECT v.id FROM prompt_verzije v WHERE v.kljuc = 'sistemski_prompt' AND v.tekst = postavke.vrijednost ORDER BY v.broj DESC LIMIT 1
) WHERE kljuc = 'sistemski_prompt';
UPDATE stilovi SET predlozak_verzija = (SELECT v.id FROM prompt_verzije v WHERE v.kljuc = 'predlozak:' || stilovi.kod AND v.broj = 1);

-- Poslovi do sada: sistemski prompt se prepoznaje po tekstu (zapisan je kad ih je runner uzeo),
-- predložak je za sve bio v1.
UPDATE generiranja SET sistemski_verzija = (
  SELECT v.id FROM prompt_verzije v WHERE v.kljuc = 'sistemski_prompt' AND v.tekst = generiranja.sistemski ORDER BY v.broj DESC LIMIT 1
) WHERE sistemski IS NOT NULL;
UPDATE generiranja SET predlozak_verzija = (SELECT predlozak_verzija FROM stilovi WHERE stilovi.id = generiranja.stil_id);
