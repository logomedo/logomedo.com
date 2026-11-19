-- Obavijesti superadminu e-poštom (docs/inbox/, S4): nova poruka u inboxu i novi zahtjev na /pristup.
-- Jedan red po izvoru obavijesti, za ograničenje „najviše jedna na sat”: `razgovor:<id>` ili `zahtjevi`.
-- Bez sadržaja i bez adresa; red razgovora se briše s razgovorom (retencija, src/lib/poruke.ts).
CREATE TABLE obavijesti (
  kljuc      TEXT PRIMARY KEY,
  poslano_at TEXT NOT NULL
);
