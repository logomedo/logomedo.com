-- Ocjena i napomena za cijeli glas (/admin/zvukovi/glasovi), uz ocjene pojedinih proba
-- (zvuk_probe): „topao, ali spor”, „engleski R”. Utječe na rang glasova.
CREATE TABLE zvuk_glas_biljeske (
  glas_id        TEXT PRIMARY KEY,
  glas_ime       TEXT,
  ocjena         INTEGER CHECK (ocjena IN (-1, 1)),
  napomena       TEXT,
  izmijenio      TEXT,
  izmijenjeno_at TEXT NOT NULL DEFAULT (datetime('now'))
);
