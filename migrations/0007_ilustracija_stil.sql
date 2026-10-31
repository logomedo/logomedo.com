-- Stil `ilustracija` prema uzoru (božićna abeceda iz Geminija, 31. 10. 2026.): toplo, drvene
-- bojice i lagani akvarel, smeđi obrisi, svijetla krem pozadina. Runner uz prompt šalje i
-- referentne slike stila iz ~/git/.agy-logomedo/stil/ilustracija/ (lokalno, nije u repou).
UPDATE stilovi SET predlozak =
'Cozy hand-drawn illustration for a children''s picture book, used in a speech therapy workbook. Exactly one clearly recognizable {rijec} (Croatian word; {opis}), centered, the whole object visible, generous empty margin around it. Style: soft colored pencil with a light watercolor wash, delicate dark-brown ink outlines, visible pencil texture, warm palette of cranberry red, pine green, honey gold and warm browns, small charming decorative details, friendly rounded shapes; characters have gentle cheerful faces. Plain very light cream background (almost white), flat and even: no scene, no ground, no shadow blob, no text, no letters, no frame. Square 1:1. {napomena}'
WHERE kod = 'ilustracija';
