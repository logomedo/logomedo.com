-- Simboli u katalogu znakova (src/lib/znakovi.ts, POCETNI_SIMBOLI): znakovi koji nisu ni slovo ni
-- brojka, a mogu biti uljez među slovima (§ među S, ¢ među c, ¥ među Y). Admin: /admin/znakovi, skupina „Simboli”.
INSERT OR IGNORE INTO rijeci (rijec, slug, izvor, vrsta) VALUES
  ('§', 'znak-ua7', 'admin', 'znak'),
  ('¥', 'znak-ua5', 'admin', 'znak'),
  ('¢', 'znak-ua2', 'admin', 'znak'),
  ('£', 'znak-ua3', 'admin', 'znak'),
  ('€', 'znak-u20ac', 'admin', 'znak'),
  ('$', 'znak-u24', 'admin', 'znak'),
  ('¤', 'znak-ua4', 'admin', 'znak'),
  ('¶', 'znak-ub6', 'admin', 'znak'),
  ('&', 'znak-u26', 'admin', 'znak'),
  ('@', 'znak-u40', 'admin', 'znak'),
  ('#', 'znak-u23', 'admin', 'znak'),
  ('%', 'znak-u25', 'admin', 'znak'),
  ('©', 'znak-ua9', 'admin', 'znak'),
  ('?', 'znak-u3f', 'admin', 'znak'),
  ('!', 'znak-u21', 'admin', 'znak'),
  ('+', 'znak-u2b', 'admin', 'znak'),
  ('=', 'znak-u3d', 'admin', 'znak'),
  ('×', 'znak-ud7', 'admin', 'znak'),
  ('÷', 'znak-uf7', 'admin', 'znak'),
  ('*', 'znak-u2a', 'admin', 'znak');
