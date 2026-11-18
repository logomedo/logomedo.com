-- Revizija prije alfe (docs/rbac/2026-11-18-revizija-logoped-alfa.md, ODLUKA 2): logopedovo „Odobri”
-- ne odobrava sliku za sve nego je predlaže; superadmin potvrđuje. Status ostaje 'kandidat'
-- (CHECK na `slike.status` bi tražio prepisivanje tablice), a prijedlog je u ova dva stupca.
ALTER TABLE slike ADD COLUMN predlozio TEXT;
ALTER TABLE slike ADD COLUMN predlozeno_at TEXT;
