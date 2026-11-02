-- Ponovno crtanje nakon odbijanja ide ispred backfilla (red je inače FIFO po id-u, pa bi
-- popravak odbijene slike čekao iza stotina novih riječi). prioritet 1 = riječ u tom stilu ima
-- odbijenu sliku; runner uzima ORDER BY prioritet DESC, id.
ALTER TABLE generiranja ADD COLUMN prioritet INTEGER NOT NULL DEFAULT 0;
DROP INDEX generiranja_red;
CREATE INDEX generiranja_red ON generiranja (status, prioritet DESC, id);
UPDATE generiranja SET prioritet = 1 WHERE status IN ('ceka', 'radi') AND EXISTS (
  SELECT 1 FROM slike s WHERE s.rijec_id = generiranja.rijec_id AND s.stil_id = generiranja.stil_id AND s.status = 'odbijena');
