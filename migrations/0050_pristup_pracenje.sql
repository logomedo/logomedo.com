-- Ekran nakon auto-odobravanja kuponom (docs/kuponi.md, „Nakon odobravanja”): osoba u istom pregledniku može sama
-- ponovno poslati pozivnicu (najranije 60 s nakon zadnjeg slanja, najviše 4 slanja) i javiti da mail nije stigao.
-- `pracenje_hash`: sha-256 tokena iz kolačića __Host-logomedo_pristup (72 h); token se ne sprema.
-- `slanja`: koliko je pozivnica poslano e-poštom za ovaj zahtjev (1 = prvo, auto-odobravanje).
-- `pomoc_at` / `pomoc_kontakt`: „Mail nije stigao” (+ dobrovoljan kontakt, npr. broj mobitela); briše se sa zahtjevom.
ALTER TABLE zahtjevi_pristupa ADD COLUMN pracenje_hash TEXT;
ALTER TABLE zahtjevi_pristupa ADD COLUMN slanja INTEGER NOT NULL DEFAULT 0;
ALTER TABLE zahtjevi_pristupa ADD COLUMN zadnje_slanje_at TEXT;
ALTER TABLE zahtjevi_pristupa ADD COLUMN pomoc_at TEXT;
ALTER TABLE zahtjevi_pristupa ADD COLUMN pomoc_kontakt TEXT;
CREATE INDEX zahtjevi_pristupa_pracenje ON zahtjevi_pristupa (pracenje_hash) WHERE pracenje_hash IS NOT NULL;
