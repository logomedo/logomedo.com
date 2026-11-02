-- Sistemski prompt v4 i predlošci v2 (2. 11. 2026.), iz recenzija u docs/prompt/recenzije/2026-11-02.md.
-- Svako pravilo poopćava skupinu komentara; obrazloženje u docs/prompt-iteracije.md.
-- Povratak: /admin/prompt → „Aktiviraj” na starijoj verziji.
INSERT INTO prompt_verzije (kljuc, broj, tekst, biljeska, autor)
SELECT 'sistemski_prompt', COALESCE(MAX(broj), 0) + 1,
'Rules for every image. They override anything else in this prompt.
1. FACES: only people and animals may have faces. Never draw eyes, mouths, smiles or faces on objects, food, plants, buildings, vehicles, clothing, weather or natural phenomena (smoke, clouds, snow, ice, the sun, the moon).
2. REALISM: draw the subject as it really looks: real shape, proportions, anatomy and colors. A snowflake is plain white; a pine branch has needles and no berries; an owl has ordinary feathered wings; reindeer antlers look like real reindeer antlers; tractor tyres are black; a lollipop is the classic red-and-white swirl. No rainbow or fantasy colors, no glitter, no satin or metallic sheen unless the real thing has it.
3. NOTHING EXTRA: do not add clothing, scarves, ornaments, bows, garlands, smoke, drivers or other people to the subject unless the word asks for them. Animals, plants, food, buildings and natural phenomena stay undecorated. No text, letters, labels or logos anywhere, not even on cups or packaging.
4. FOCUS: the named thing dominates the picture. Parts that only hold or connect it (a hanging loop, a string, a stand) stay small and secondary.
5. CONSISTENCY: paired or repeated parts are identical: both skis, both gloves, both ends of a scarf have the same shape, size and pattern.
6. FORM: show solid objects in a gentle three-quarter view so their volume reads (a gift box is clearly a cube, a cake slice clearly a block with layers).
7. NUMBER: match the grammatical number of the Croatian word. Singular (KUGLICA, TRAG) means exactly one. Plural (KUGLICE, UKRASI, LJUDI, TRAGOVI) means a small group, varied when the word implies variety: UKRASI are different kinds of ornaments, LJUDI are many people of different ages, not one family. Keep every item large and readable: 3 to 5 big items, never many tiny ones.
8. MEANING: use the meaning a five-year-old Croatian child knows from everyday life. When the object alone would be unclear, show it where it belongs: windscreen wipers on a car windscreen, roof tiles on a roof, KOŠ is a basketball hoop, BAL is a decorated ballroom with many dancing couples. A description given above always wins.',
'Iz 29 komentara (snimak 2026-11-02): 1 smajlići (dim, fritule, grana, hlače, led, lizalica, cvijet); 2 realizam (pahuljica, sova, sob, grana, traktor, lizalica); 3 ništa suvišno (led šal, iglu dim i ukrasi, traktor vozač, čaj natpis); 4 fokus (zvono); 5 parovi (skije, šal); 6 volumen (poklon, kolač); 7 broj (kuglice, ukrasi, ljudi, trag); 8 značenje (brisači, crijep, koš, bal).',
'migracija 0014'
FROM prompt_verzije WHERE kljuc = 'sistemski_prompt';

-- Predložak ilustracije v2: makne „characters have gentle cheerful faces” i „small charming decorative
-- details” (izvor smajlića i ukrasa), „Exactly one” (sukob s množinom) i strogo „no scene” (brisači, bal).
INSERT INTO prompt_verzije (kljuc, broj, tekst, biljeska, autor)
SELECT 'predlozak:ilustracija', COALESCE(MAX(broj), 0) + 1,
'Cozy hand-drawn illustration for a children''s picture book, used in a speech therapy workbook. A clearly recognizable {rijec} (Croatian word; {opis}), centered, the whole subject visible, generous empty margin around it. Style: soft colored pencil with a light watercolor wash, delicate dark-brown ink outlines, visible pencil texture, friendly rounded shapes, warm soft palette (cranberry red, pine green, honey gold, warm browns) where it suits the subject, but the real colors of the subject always win. Plain very light cream background (almost white), flat and even: no scene unless the word needs one to be understood, no ground, no shadow blob, no text, no letters, no frame. Square 1:1. {napomena}',
'Bez lica i ukrasa iz predloška (sukob sa sistemskim promptom); broj i kontekst prepušteni sistemskom promptu v4 (pravila 7 i 8).',
'migracija 0014'
FROM prompt_verzije WHERE kljuc = 'predlozak:ilustracija';

INSERT INTO prompt_verzije (kljuc, broj, tekst, biljeska, autor)
SELECT 'predlozak:bojanka', COALESCE(MAX(broj), 0) + 1,
'Children''s coloring book page for a speech therapy worksheet. A clearly recognizable {rijec} (Croatian word; {opis}), centered, the whole subject visible. Clean thick black outlines on a pure white background. No shading, no gray, no color fills, no text, no letters, no frame. Simple, friendly shapes a five-year-old can color in. Square 1:1. {napomena}',
'„Exactly one” → „A clearly recognizable”, da množina (pravilo 7 sistemskog prompta v4) radi i za bojanku.',
'migracija 0014'
FROM prompt_verzije WHERE kljuc = 'predlozak:bojanka';

-- Aktiviraj nove verzije (isto što radi gumb „Aktiviraj”).
UPDATE postavke SET
  vrijednost = (SELECT tekst FROM prompt_verzije WHERE kljuc = 'sistemski_prompt' ORDER BY broj DESC LIMIT 1),
  verzija_id = (SELECT id FROM prompt_verzije WHERE kljuc = 'sistemski_prompt' ORDER BY broj DESC LIMIT 1),
  izmijenio = 'migracija 0014', izmijenjeno_at = datetime('now')
WHERE kljuc = 'sistemski_prompt';
UPDATE stilovi SET
  predlozak_verzija = (SELECT id FROM prompt_verzije v WHERE v.kljuc = 'predlozak:' || stilovi.kod ORDER BY broj DESC LIMIT 1),
  predlozak = (SELECT tekst FROM prompt_verzije v WHERE v.kljuc = 'predlozak:' || stilovi.kod ORDER BY broj DESC LIMIT 1);
INSERT INTO postavke_povijest (kljuc, vrijednost, izmijenio)
SELECT 'sistemski_prompt', vrijednost, 'migracija 0014' FROM postavke WHERE kljuc = 'sistemski_prompt';
INSERT INTO postavke_povijest (kljuc, vrijednost, izmijenio)
SELECT 'predlozak:' || kod, predlozak, 'migracija 0014' FROM stilovi;

-- Poslovi koji čekaju složeni su po v1 predlošku (riječ, opis i napomena su već umetnuti), pa se
-- prepisuju samo dijelovi koji se razlikuju; rezultat je isti kao da su složeni po v2.
UPDATE generiranja SET
  prompt = REPLACE(REPLACE(REPLACE(REPLACE(prompt,
    'Exactly one clearly recognizable ', 'A clearly recognizable '),
    ', the whole object visible', ', the whole subject visible'),
    'warm palette of cranberry red, pine green, honey gold and warm browns, small charming decorative details, friendly rounded shapes; characters have gentle cheerful faces.',
    'friendly rounded shapes, warm soft palette (cranberry red, pine green, honey gold, warm browns) where it suits the subject, but the real colors of the subject always win.'),
    'flat and even: no scene, no ground', 'flat and even: no scene unless the word needs one to be understood, no ground'),
  predlozak_verzija = (SELECT predlozak_verzija FROM stilovi WHERE stilovi.id = generiranja.stil_id)
WHERE status = 'ceka';
