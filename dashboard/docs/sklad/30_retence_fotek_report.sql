-- SKLAD 1.0 — REPORT uchovávání originálních fotek dokladů (jen čtení, NIC nemaže).
-- Stejné pravidlo jako lib/sklad/photoRetention.ts (viz RETENCE_FOTEK.md):
--   potvrzená / stornovaná příjemka → drží se do 31. 12. (rok dokladu + 10),
--   nepotvrzený návrh bez změny 180+ dní → kandidát,
--   cokoli jiného → drží se.
-- Soubory v Blobu bez stránky příjemky tento report nevidí (nejsou v DB) —
-- ty vypíše až budoucí skript nad seznamem Blobu, také jen jako návrh.
SELECT
  p.storage_key,
  r.id AS prijemka,
  r.status,
  r.document_date,
  CASE
    WHEN r.status IN ('confirmed', 'voided') AND r.confirmed_at IS NOT NULL
      THEN make_date(coalesce(extract(year FROM r.document_date)::int, extract(year FROM r.confirmed_at AT TIME ZONE 'UTC')::int) + 10, 12, 31)
  END AS drzet_do,
  CASE
    WHEN r.status IN ('confirmed', 'voided') AND r.confirmed_at IS NOT NULL
         AND current_date > make_date(coalesce(extract(year FROM r.document_date)::int, extract(year FROM r.confirmed_at AT TIME ZONE 'UTC')::int) + 10, 12, 31)
      THEN 'kandidát: účetní lhůta uplynula'
    WHEN r.status = 'draft' AND r.updated_at <= now() - interval '180 days'
      THEN 'kandidát: nepotvrzený návrh bez změny 180+ dní'
    ELSE 'držet'
  END AS rozhodnuti
FROM goods_receipt_document_pages p
JOIN goods_receipt_documents d ON d.id = p.document_id
JOIN goods_receipts r ON r.id = d.receipt_id
ORDER BY rozhodnuti, r.document_date NULLS LAST, p.storage_key;
