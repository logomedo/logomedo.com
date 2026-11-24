-- Narudžba kroz obrazac /pristup (landing odluka 816): uz besplatan beta pristup obrazac prima i odabrani paket
-- (mjesečno, godišnje, doživotno) te upit ustanove za više licenci (`broj_licenci`). Kartično plaćanje još ne postoji:
-- superadmin pošalje račun ili ponudu i, kad uplata stigne, odobri zahtjev bez daljnje procjene.
ALTER TABLE zahtjevi_pristupa ADD COLUMN paket TEXT NOT NULL DEFAULT 'beta'
  CHECK (paket IN ('beta', 'mjesecno', 'godisnje', 'dozivotno', 'ustanova'));
ALTER TABLE zahtjevi_pristupa ADD COLUMN broj_licenci INTEGER CHECK (broj_licenci IS NULL OR broj_licenci BETWEEN 1 AND 1000);
