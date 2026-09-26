-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Návrat kroku 4. Technicky vždy vratné; smaže ale údaje uložené do nových
-- sloupců (poznámky zákazníků, způsob dopravy, souhlasy) — po spuštění
-- e-shopu jen po záloze.
ALTER TABLE orders DROP CONSTRAINT orders_total_consistent;
ALTER TABLE orders DROP CONSTRAINT orders_discount_nonnegative;
ALTER TABLE orders DROP CONSTRAINT orders_channel_check;
ALTER TABLE orders
  DROP COLUMN terms_accepted_at,
  DROP COLUMN age_confirmed_at,
  DROP COLUMN discount_kc,
  DROP COLUMN payment_method_label,
  DROP COLUMN payment_method_code,
  DROP COLUMN shipping_method_label,
  DROP COLUMN shipping_method_code,
  DROP COLUMN customer_note,
  DROP COLUMN channel;
