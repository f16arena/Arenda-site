-- Move legacy IP/physical-person identifiers from bin to iin.
-- BIN stays only for legal entities; IP and physical tenants use IIN.
UPDATE tenants
SET
  iin = COALESCE(NULLIF(iin, ''), bin),
  bin = NULL
WHERE legal_type IN ('IP', 'PHYSICAL', 'PERSON', 'INDIVIDUAL')
  AND bin IS NOT NULL
  AND bin <> '';
