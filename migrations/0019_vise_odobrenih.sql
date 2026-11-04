-- Riječ smije imati više odobrenih slika po stilu (npr. tri bojanke i pet ilustracija za PREGAČU).
-- Do sada je unique indeks dopuštao jednu, a odobravanje nove vraćalo bi staru u kandidate.
DROP INDEX IF EXISTS slike_odobrena;
