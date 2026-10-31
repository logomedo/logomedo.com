-- Bilježnice (docs/biljeznice.md): tematski niz zadataka s javnom poveznicom /b/<slug>,
-- interaktivno (svaki riješen ekran pali lampicu na boru) i za ispis.

-- Ilustracija u boji (akvarel), uz crno-bijelu bojanku. Bez SVG-a (runner ga radi samo za bojanku).
INSERT OR IGNORE INTO stilovi (kod, naziv, predlozak) VALUES ('ilustracija', 'Ilustracija',
'Warm watercolor illustration for a children''s picture book, used in a speech therapy workbook. Exactly one clearly recognizable {rijec} (Croatian word; {opis}), centered, the whole object visible, generous empty margin around it. Soft hand-drawn ink outlines with gentle watercolor colors, friendly and cozy. Plain pure white background: no scene, no ground, no shadow blob, no text, no letters, no frame. Square 1:1. {napomena}');

CREATE TABLE biljeznice (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,            -- javna poveznica /b/<slug>
  naslov      TEXT NOT NULL,
  podnaslov   TEXT,
  tema        TEXT NOT NULL DEFAULT 'bozic' CHECK (tema IN ('bozic')),
  stil        TEXT NOT NULL DEFAULT 'ilustracija',  -- koji stil slika prikazuje (pada na bojanku)
  javna       INTEGER NOT NULL DEFAULT 1,
  autor_id    INTEGER NOT NULL REFERENCES korisnici(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE biljeznica_zadaci (
  biljeznica_id INTEGER NOT NULL REFERENCES biljeznice(id) ON DELETE CASCADE,
  zadatak_id    INTEGER NOT NULL REFERENCES zadaci(id),
  redoslijed    INTEGER NOT NULL,
  PRIMARY KEY (biljeznica_id, zadatak_id)
);
