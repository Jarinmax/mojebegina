-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Krok 4 (drizzle 0014): nové sloupce objednávky. Defaulty zachovávají
-- chování dnešního createOrder (channel = manual, discount_kc = 0).
ALTER TABLE orders
  ADD COLUMN channel text NOT NULL DEFAULT 'manual',
  ADD COLUMN customer_note text,
  ADD COLUMN shipping_method_code text,
  ADD COLUMN shipping_method_label text,
  ADD COLUMN payment_method_code text,
  ADD COLUMN payment_method_label text,
  ADD COLUMN discount_kc integer NOT NULL DEFAULT 0,
  ADD COLUMN age_confirmed_at timestamptz,
  ADD COLUMN terms_accepted_at timestamptz;

ALTER TABLE orders ADD CONSTRAINT orders_channel_check CHECK (channel IN ('manual', 'eshop', 'import'));
ALTER TABLE orders ADD CONSTRAINT orders_discount_nonnegative CHECK (discount_kc >= 0);
ALTER TABLE orders ADD CONSTRAINT orders_total_consistent
  CHECK (total_kc = subtotal_kc - discount_kc + shipping_kc);

-- Dvě objednávky The Cup nahrané importem (entered_by_user_id IS NULL,
-- ověřeno 26. 9. 2026). Explicitně podle id, ne heuristikou.
UPDATE orders SET channel = 'import'
WHERE id IN ('329f54d5-5a7d-4522-a21e-b7ad9cde24e2', '984e3645-1f2f-4444-8e8e-eeac75165a0a');
