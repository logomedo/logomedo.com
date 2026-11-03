-- Stil slika po zadatku (3. 11. 2026.): editor i ispis pokazuju slike u tom stilu, a riječ bez
-- slike u njemu pada na drugi stil. Prije je editor uzimao zadnju sliku bez obzira na stil, pa je
-- SNJEGOVIĆ uvijek bio bojanka iako ima i odobrenu ilustraciju. Zadano kao u bilježnicama.
ALTER TABLE zadaci ADD COLUMN stil TEXT NOT NULL DEFAULT 'ilustracija';
