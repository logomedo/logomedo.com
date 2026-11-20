-- Varijante snimke glasa (docs/zvukovi.md „Snimke glasova”): jedan glas može imati više odobrenih snimki
-- (npr. „sss” kratko i produljeno, zaporni s i bez šva), a igra pušta **primarnu**. Do sad je nova snimka
-- istog glasa zamijenila staru.
--
-- `primarna` = 1 za najviše jedan redak po ključu (djelomični UNIQUE). Za TTS izgovor nije važna: tamo je
-- odobren uvijek jedan. `oznaka` je kratki opis varijante („produljeno”, „bez šva”), slobodan tekst.
ALTER TABLE zvukovi ADD COLUMN primarna INTEGER NOT NULL DEFAULT 0;
ALTER TABLE zvukovi ADD COLUMN oznaka TEXT;

UPDATE zvukovi SET primarna = 1 WHERE model = 'snimka' AND status = 'odobren';

CREATE UNIQUE INDEX zvukovi_primarna ON zvukovi (kljuc) WHERE primarna = 1;
