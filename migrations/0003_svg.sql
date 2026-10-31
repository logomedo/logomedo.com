-- Vektorska verzija bojanke (potrace na Macu, scripts/svg.sh): isti ključ kao r2_kljuc, ekstenzija .svg.
-- NULL dok runner ne pošalje SVG. Javni bucket drži i nju za odobrene slike.
ALTER TABLE slike ADD COLUMN svg_kljuc TEXT;
