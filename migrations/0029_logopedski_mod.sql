-- Logopedski mod po korisniku (/admin/postavke): uključen nudi „Po glasovima…” na predlošcima.
-- Zadano uključeno, jer su dosadašnji korisnici logopedi i listić po glasovima već koriste.
ALTER TABLE korisnici ADD COLUMN logopedski_mod INTEGER NOT NULL DEFAULT 1;
