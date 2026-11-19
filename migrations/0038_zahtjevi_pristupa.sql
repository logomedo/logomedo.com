-- S7 landinga (docs/landing/): obrazac „Zatraži pristup” na /pristup za privatnu betu.
--
-- Logoped s landinga pošalje zahtjev; superadmin ga na /admin/zahtjevi odobri (nastane obična pozivnica,
-- src/lib/admin/pozivi.ts izdaj()) ili odbije. Logika: src/lib/pristup.ts (javni dio) i src/lib/admin/zahtjevi.ts.
-- U `aktivnost` se zahtjevi ne bilježe (CHECK na `aktivnost.tablica` ih ne poznaje); trag obrade je
-- `obradio`/`obradjen_at`, a izdavanje pozivnice izdaj() ionako upiše kao 'poziv.izdan'.
--
-- Retencija (ROK_MJESECI u src/lib/pristup-rokovi.ts, isti broj kao na /privatnost#pristup): 'novi' i 'odbijen'
-- se brišu 6 mjeseci nakon `created_at`; 'odobren' kad je pozivnica iskorištena (`poziv_token_hash` =
-- pozivi.token_hash) ili 6 mjeseci nakon `obradjen_at`. `ip_hash` (sha-256, nikad sirovi IP) služi samo
-- ograničenju broja zahtjeva i briše se nakon 24 sata.
CREATE TABLE zahtjevi_pristupa (
  id               INTEGER PRIMARY KEY,
  ime              TEXT NOT NULL,
  email            TEXT NOT NULL,                    -- normaliziran (trim, mala slova)
  ustanova         TEXT,
  grad             TEXT,
  poruka           TEXT,
  privola_at       TEXT NOT NULL,                    -- kvačica uz /privatnost#pristup
  created_at       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'novi' CHECK (status IN ('novi', 'odobren', 'odbijen')),
  obradio          TEXT,                             -- e-mail superadmina
  obradjen_at      TEXT,
  poziv_token_hash TEXT,                             -- pozivi.token_hash izdane pozivnice (samo 'odobren')
  ip_hash          TEXT
);
CREATE INDEX zahtjevi_pristupa_email ON zahtjevi_pristupa (email);
CREATE INDEX zahtjevi_pristupa_status ON zahtjevi_pristupa (status, created_at);
CREATE INDEX zahtjevi_pristupa_ip ON zahtjevi_pristupa (ip_hash, created_at);
