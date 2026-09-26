-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Krok 6b (drizzle 0016b): ZAPNUTÍ ČÍSLOVÁNÍ V DEN PŘEPNUTÍ Z WOOCOMMERCE.
--
-- Postup (viz ESHOP_SCHEMA_PROPOSAL.md, oddíl Číslování):
--   1. Ve WooCommerce vypnout pokladnu (údržba), počkat na dokončení plateb.
--   2. Zjistit nejvyšší ČÍSLO OBJEDNÁVKY, které vidí zákazník (e-mail
--      "Objednávka č. 5093"), ne interní ID jiného pluginu.
--   3. Nahradit <MAX_WOO_ORDER_NUMBER> na DVOU místech níže.
--      Dokud placeholder zůstane, skript záměrně skončí syntaktickou chybou.
--   Rozhodnuto 26. 9. 2026: tvrdé přepnutí, start = MAX (další číslo MAX + 1).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM orders WHERE order_number > <MAX_WOO_ORDER_NUMBER>) THEN
    RAISE EXCEPTION 'V orders už je číslo vyšší než zvolený start řady — zastavuji.';
  END IF;
END $$;

CREATE SEQUENCE order_number_seq AS bigint MINVALUE 1;
SELECT setval('order_number_seq', <MAX_WOO_ORDER_NUMBER>, true); -- další číslo = MAX + 1
ALTER SEQUENCE order_number_seq OWNED BY orders.order_number;
ALTER TABLE orders ALTER COLUMN order_number SET DEFAULT nextval('order_number_seq');

-- Ruční a e-shopové objednávky vzniklé mezi 6a a 6b dostanou čísla podle data.
UPDATE orders o SET order_number = n.num
FROM (
  SELECT id, nextval('order_number_seq') AS num
  FROM (SELECT id FROM orders WHERE order_number IS NULL AND channel <> 'import'
        ORDER BY ordered_at, id) s
) n
WHERE o.id = n.id;

-- Import (historie) smí zůstat bez čísla; importované Woo objednávky nesou
-- svoje původní číslo (vkládá se explicitně, ne ze sekvence).
ALTER TABLE orders ADD CONSTRAINT orders_number_required
  CHECK (channel = 'import' OR order_number IS NOT NULL);
