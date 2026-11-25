-- 157 (25. 11. 2026, Lucie): hlídání počtu kusů u doprodávaných sirupových kapsiček 650 ml.
-- product_variants.stock_qty: NULL = počet se nehlídá, číslo = kolik kusů zbývá.
-- Objednávka z e-shopu kusy odečte, na 0 se balení samo přepne na „Vyprodáno“, storno kusy vrátí.
-- Stav podle inventury 24.–25. 11.: Zázvorový 27, Meduňkový s levandulí 5, Lipový 4.
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production), jen jednou.
BEGIN;

DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
END $$;

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS stock_qty integer;
ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS product_variants_stock_qty_nonnegative;
ALTER TABLE product_variants ADD CONSTRAINT product_variants_stock_qty_nonnegative CHECK (stock_qty IS NULL OR stock_qty >= 0);

CREATE TABLE IF NOT EXISTS eshop_stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);
CREATE INDEX IF NOT EXISTS eshop_stock_reservations_order_idx ON eshop_stock_reservations (order_id);

CREATE TABLE IF NOT EXISTS eshop_stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  quantity_before integer,
  quantity_after integer NOT NULL,
  reason text NOT NULL,
  author_user_id text,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

UPDATE product_variants SET stock_qty = 27, sold_out = false, updated_at = now() WHERE sku = 'zazvorovy-sirup-750ml';
UPDATE product_variants SET stock_qty = 5,  sold_out = false, updated_at = now() WHERE sku = 'medunkovy-sirup-s-levanduli-750ml';
UPDATE product_variants SET stock_qty = 4,  sold_out = false, updated_at = now() WHERE sku = 'lipovy-sirup-750ml';

SELECT sku, label, stock_qty, sold_out FROM product_variants WHERE stock_qty IS NOT NULL ORDER BY sku;

COMMIT;
