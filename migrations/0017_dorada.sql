-- Pregled: odbijanje ima dva polja (3. 11. 2026.). `razlog` = što ne valja (zabrana),
-- `dorada` = kako treba biti. Oboje ulazi u blok REVIEWER CORRECTIONS sljedećeg posla.
ALTER TABLE slike ADD COLUMN dorada TEXT;
-- Slika dobra, ali za drugu riječ (MAČ → nacrtan mačić): original je odbijen, a kopija ide
-- ciljnoj riječi. Ovdje je id kopije, da se zna kamo je otišla.
ALTER TABLE slike ADD COLUMN premjestena_u INTEGER REFERENCES slike(id);
