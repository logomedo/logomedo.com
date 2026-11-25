-- Uplate i računi (docs/naplata.md). Jedna uplata = jedan račun izdan kroz domovina-fiskal (ITalk d.o.o. je tenant).
-- Vrstu računa određuju način plaćanja i kupac (src/lib/naplata.ts): kartica → fiskalizirani račun (i firmi, čl. 39
-- Zakona o fiskalizaciji), SEPA firmi ili ustanovi → eRačun, građaninu uvijek fiskalizirani račun.
-- `izvor`: 'simulacija' (gumb na /admin/zahtjevi, samo kad je NAPLATA_SIMULACIJA uključena, tj. staging) i 'rucno';
-- 'stripe' / 'banka' dolaze s pravim checkoutom i bank-push-gatewayem.
-- Zahtjev se smije obrisati (retencija /pristup), uplata ostaje: račun je knjigovodstvena isprava.
CREATE TABLE uplate (
  id                  INTEGER PRIMARY KEY,
  zahtjev_id          INTEGER REFERENCES zahtjevi_pristupa(id) ON DELETE SET NULL,
  email               TEXT NOT NULL,                     -- osoba kojoj se otvara pristup
  paket               TEXT NOT NULL CHECK (paket IN ('mjesecno', 'godisnje', 'dozivotno', 'ustanova')),
  broj_licenci        INTEGER NOT NULL DEFAULT 1 CHECK (broj_licenci BETWEEN 1 AND 1000),
  iznos_centi         INTEGER NOT NULL CHECK (iznos_centi > 0),  -- ukupno s PDV-om
  nacin               TEXT NOT NULL CHECK (nacin IN ('kartica', 'sepa')),
  izvor               TEXT NOT NULL CHECK (izvor IN ('simulacija', 'rucno', 'stripe', 'banka')),
  kupac_tip           TEXT NOT NULL CHECK (kupac_tip IN ('fizicka', 'pravna', 'drzava')),
  kupac_naziv         TEXT NOT NULL,
  kupac_oib           TEXT,
  kupac_ulica         TEXT,
  kupac_grad          TEXT,
  kupac_postanski_broj TEXT,
  trazi_eracun        INTEGER NOT NULL DEFAULT 0 CHECK (trazi_eracun IN (0, 1)),
  placeno_at          TEXT NOT NULL,
  unio                TEXT NOT NULL,                     -- e-mail superadmina ili 'stripe' / 'banka'
  -- Račun u domovina-fiskal: FISKALNI_B2C | ERACUN_B2B | ERACUN_B2G
  racun_tip           TEXT,
  racun_status        TEXT NOT NULL DEFAULT 'ceka' CHECK (racun_status IN ('ceka', 'izdan', 'poslan', 'greska')),
  fiskal_url          TEXT,                              -- okolina u kojoj je izdan (fiskal-test / fiskal)
  fiskal_id           INTEGER,
  broj_racuna         TEXT,
  jir                 TEXT,
  dostava             TEXT,                              -- „e-mail: x” ili „eRačun: status”
  greska              TEXT,
  azurirano_at        TEXT
);
CREATE UNIQUE INDEX uplate_zahtjev ON uplate (zahtjev_id) WHERE zahtjev_id IS NOT NULL;
CREATE INDEX uplate_placeno ON uplate (placeno_at);
