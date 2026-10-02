-- PRODUCTION — ZAPNUTÍ ČÍSLOVÁNÍ OBJEDNÁVEK (den přepnutí z WooCommerce).
--
-- Na řádku „start bigint := …“ nahradit zástupný text v lomených závorkách
-- JEDNÍM číslem (v souboru je jen tento jeden výskyt):
--   doporučeno = nejvyšší číslo objednávky z WooCommerce zaokrouhlené
--   NAHORU na celou stovku (např. Woo 5137 → START 5200 → první nová 5201).
--   Rezerva pohltí objednávky, které by ve WooCommerce vznikly i po odečtení
--   maxima (rozběhnuté platby, ruční založení v adminu WooCommerce).
-- Dokud tam zástupný text zůstane, skript skončí syntaktickou chybou a nic neudělá.
--
-- Celý blok je jeden příkaz = jedna transakce: jakákoli pojistka nebo chyba
-- → nezmění se nic.
DO $$
DECLARE
  start bigint := <START>;
BEGIN
  -- Pojistky
  IF start < 1000 OR start >= 900000 THEN
    RAISE EXCEPTION 'Start řady % mimo rozsah 1000–899999 (900000+ je testovací řada Preview).', start;
  END IF;
  IF to_regclass('public.order_number_seq') IS NOT NULL THEN
    RAISE EXCEPTION 'Číslování už je zapnuté (order_number_seq existuje) — zastavuji.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_number') THEN
    RAISE EXCEPTION 'Chybí sloupec orders.order_number (migrace 0018) — nejdřív migrace 0013–0019.';
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE order_number >= start) THEN
    RAISE EXCEPTION 'V orders už je číslo % nebo vyšší — zastavuji.', start;
  END IF;

  -- Řada: další číslo = start + 1
  CREATE SEQUENCE order_number_seq AS bigint MINVALUE 1;
  PERFORM setval('order_number_seq', start, true);
  ALTER SEQUENCE order_number_seq OWNED BY orders.order_number;
  ALTER TABLE orders ALTER COLUMN order_number SET DEFAULT nextval('order_number_seq');

  -- Ruční / e-shopové objednávky bez čísla dostanou čísla podle data.
  -- Import (historie, The Cup) zůstává bez čísla.
  UPDATE orders o SET order_number = n.num
  FROM (
    SELECT id, nextval('order_number_seq') AS num
    FROM (SELECT id FROM orders WHERE order_number IS NULL AND channel <> 'import'
          ORDER BY ordered_at, id) s
  ) n
  WHERE o.id = n.id;

  ALTER TABLE orders ADD CONSTRAINT orders_number_required
    CHECK (channel = 'import' OR order_number IS NOT NULL);
END $$;
