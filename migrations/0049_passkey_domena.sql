-- Domena (WebAuthn rpID) na kojoj je passkey upisan. Ključ radi samo na toj domeni, pa staging
-- (kopija produkcijske baze) ključeve s logomedo.com prikazuje kao „samo logomedo.com”.
-- NULL = upisan prije ove migracije, dakle na produkciji (logomedo.com); podaci se ne diraju.
ALTER TABLE admin_passkeys ADD COLUMN rp_id TEXT;
