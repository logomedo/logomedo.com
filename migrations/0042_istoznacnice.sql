-- Istoznačnice (docs/katalog.md, „Istoznačnice”): riječi istog značenja (KREVET, POSTELJA). Generator zadatka
-- s predloška iz jedne grupe uzima najviše jednu riječ. Riječ je u najviše jednoj grupi; grupa je samo broj
-- (najmanji id riječi pri nastanku), grupa s jednom riječi se briše.
CREATE TABLE istoznacnice (
  rijec_id    INTEGER PRIMARY KEY REFERENCES rijeci(id) ON DELETE CASCADE,
  grupa       INTEGER NOT NULL,
  dodao       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX istoznacnice_grupa ON istoznacnice(grupa);
