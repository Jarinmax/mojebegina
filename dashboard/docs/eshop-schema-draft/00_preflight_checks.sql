-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Krok 0: kontrolní dotazy (jen čtení). Všechny musí vrátit 0 řádků / true,
-- jinak se CHECK omezení z kroků 04, 05 a 07 nepřidají.

-- 0.1 Položky: řádek = množství × cena, množství > 0 (očekáváno: 0 řádků)
SELECT id, quantity, unit_price_kc, line_total_kc FROM order_items
WHERE line_total_kc <> quantity * unit_price_kc OR quantity <= 0;

-- 0.2 Objednávky: celkem = zboží + doprava (očekáváno: 0 řádků)
SELECT id, subtotal_kc, shipping_kc, total_kc FROM orders
WHERE total_kc <> subtotal_kc + shipping_kc;

-- 0.3 Objednávky, které budou označené jako import (očekáváno 26. 9. 2026: 2 řádky The Cup)
SELECT id, ordered_at, entered_by_user_id, external_woocommerce_id FROM orders
WHERE entered_by_user_id IS NULL;

-- 0.4 Tabulky nesmí existovat (očekáváno: 0 řádků)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('product_categories', 'products', 'product_variants', 'product_images');
