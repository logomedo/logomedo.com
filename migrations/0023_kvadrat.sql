-- Katalog je katalog kvadratnih slika (8. 11. 2026.): runner uvijek traži 1:1, ali ručni upload
-- zna biti 16:9 (2752×1536 iz Gemini weba). Dimenzije se pamte pri spremanju; stare popunjava
-- `scripts/kvadrat.py --mjeri`.
ALTER TABLE slike ADD COLUMN sirina INTEGER;
ALTER TABLE slike ADD COLUMN visina INTEGER;
-- Kvadratna varijanta nekvadratne slike (`scripts/kvadrat.py`) je kandidat s `zamjenjuje` = original.
-- Kad se odobri, original prestaje biti odobren (odbijen s razlogom), pa svuda ostaje samo kvadratna.
ALTER TABLE slike ADD COLUMN zamjenjuje INTEGER REFERENCES slike(id);
