-- ŠARŽE L-20261106-DYN-01 — Dýňová polévka, 38 × bag-in-box 3 l.
-- PŘÍPRAVA: založí šarži (draft) a PŘIPRAVÍ výrobní příjem 38 ks (draft).
-- Skladové pohyby NEVZNIKNOU — kusy nejsou skladem a šarže není prodejná,
-- dokud se příjem nepotvrdí (21_L-20261106-DYN-01_potvrzeni.sql).
-- NESPUŠTĚNO. Spouští se jednou, po 11_migration.sql. Opakované spuštění
-- skončí chybou na UNIQUE(lot_code), nic se nezdvojí.
--
-- Údaje (zadal Jaroslav Viner 6. 11. 2026):
--   výrobek   Dýňová polévka  products.id 50fdd325-a225-4437-b162-5b1b445d8b95
--   balení    3 l bag-in-box  product_variants.id 67d70837-4015-420e-847b-7e4c59733cb8 (SKU dynova-polevka)
--             (ověřeno čtením produkční DB 6. 11. 2026: jediné aktivní balení výrobku)
--   výroba    přes noc z 5. na 6. 11. 2026 (přesné časy nezadány → NULL)
--   kusy      38
--   číslo     L-20261106-DYN-01 (den dokončení 6. 11., kód DYN, 1. várka dne)
--   spotřeba  19. 11. 2026 = začátek výroby 5. 11. + 14 dní (products.shelf_life_days),
--             konzervativně od začátku, ne od konce výroby; DB pozdější datum nepřijme
--   sklad     Sklad 1.0 'default' (Výchozí sklad) — pokud polévky mají vlastní
--             chladicí sklad, změnit kód lokace níž PŘED spuštěním

BEGIN;

SELECT set_config('begina.actor_user_id', 'de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c', true); -- Jaroslav Viner

-- 1. Kód výrobku pro čísla šarží (jen pokud ještě není)
UPDATE products SET lot_code = 'DYN'
WHERE id = '50fdd325-a225-4437-b162-5b1b445d8b95' AND lot_code IS NULL;

-- 2. Skladová položka hotového výrobku (jednou na balení)
INSERT INTO stock_items (name, canonical_unit, kind, linked_product_variant_id)
SELECT 'Dýňová polévka – 3 l bag-in-box', 'ks', 'finished_product', '67d70837-4015-420e-847b-7e4c59733cb8'
WHERE NOT EXISTS (
  SELECT 1 FROM stock_items
  WHERE kind = 'finished_product' AND linked_product_variant_id = '67d70837-4015-420e-847b-7e4c59733cb8'
);

-- 3. Šarže = výrobní běh (draft)
INSERT INTO production_batches (
  lot_code, product_id, lot_sequence,
  production_started_on, production_finished_on,
  best_before, output_volume_l, status, note, created_by_user_id
) VALUES (
  'L-20261106-DYN-01', '50fdd325-a225-4437-b162-5b1b445d8b95', 1,
  DATE '2026-11-05', DATE '2026-11-06',
  DATE '2026-11-19', 114, 'draft',
  'Výroba přes noc z 5. na 6. 11. 2026; 38 × bag-in-box 3 l (114 l).',
  'de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c'
);

-- 4. Výrobní příjem (draft) — jeden k této šarži
INSERT INTO production_receipts (batch_id, stock_location_id, note, created_by_user_id)
SELECT b.id, l.id, 'Příjem z výroby šarže L-20261106-DYN-01 — připraveno, čeká na potvrzení.',
       'de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c'
FROM production_batches b
JOIN stock_locations l ON l.code = 'default'
WHERE b.lot_code = 'L-20261106-DYN-01';

-- 5. Řádek příjmu: 38 ks
INSERT INTO production_receipt_lines (receipt_id, product_variant_id, stock_item_id, packages_count)
SELECT r.id, '67d70837-4015-420e-847b-7e4c59733cb8', i.id, 38
FROM production_receipts r
JOIN production_batches b ON b.id = r.batch_id
JOIN stock_items i ON i.kind = 'finished_product' AND i.linked_product_variant_id = '67d70837-4015-420e-847b-7e4c59733cb8'
WHERE b.lot_code = 'L-20261106-DYN-01' AND r.status = 'draft';

-- 6. Kontrola: musí vyjít draft | draft | 38 | 0 | 3
SELECT b.lot_code, b.status AS sarze, r.status AS prijem,
       (SELECT sum(packages_count) FROM production_receipt_lines WHERE receipt_id = r.id) AS kusu_pripraveno,
       (SELECT count(*) FROM stock_movements WHERE production_batch_id = b.id) AS skladovych_pohybu,
       (SELECT count(*) FROM production_batch_activity WHERE batch_id = b.id) AS auditnich_zaznamu
FROM production_batches b JOIN production_receipts r ON r.batch_id = b.id
WHERE b.lot_code = 'L-20261106-DYN-01';

COMMIT;
