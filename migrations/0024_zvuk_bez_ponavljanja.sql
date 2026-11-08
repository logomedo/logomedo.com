-- „Samo odbij” na /admin/zvukovi: ElevenLabs neke riječi ne zna izgovoriti, pa se tekst ne
-- generira ponovno ni kroz „Generiraj zvukove” na bilježnici, dok ga netko ručno ne vrati
-- („Generiraj ponovno” na tabu Odbijeni). Vrijedi dok je to najnovija snimka za ključ.
ALTER TABLE zvukovi ADD COLUMN bez_ponavljanja INTEGER NOT NULL DEFAULT 0;
