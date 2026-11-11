-- Kampaň „Ochutnávkový set za 159 Kč, poštovné zdarma“ (11. 11. 2026, zadání Lucie).
-- Slevový kód OCHUTNEJ: 90 Kč z ceny setu (249 → 159 Kč) + doprava zdarma,
-- jen na Ochutnávkový set, 1 set na objednávku, 1× na zákazníka, celkem 100 použití
-- (= „prvních 100 krabic“ — po stém použití kód sám přestane platit).
--
-- Kód se vloží VYPNUTÝ (is_active = false). SPUSTIT až po skriptu 95.
-- Zapnout v den startu kampaně:
--   UPDATE eshop_coupons SET is_active = true, updated_at = now() WHERE code = 'ochutnej';
-- Vypnout:  ... SET is_active = false ...
BEGIN;

DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM products WHERE slug = 'ochutnavkovy-set-sirupu') THEN
    RAISE EXCEPTION 'Chybí produkt Ochutnávkový set — nejdřív spusťte skript 95.';
  END IF;
END $$;

INSERT INTO eshop_coupons (code, discount_type, amount, free_shipping, individual_use, product_slugs,
  usage_limit, usage_limit_per_user, limit_usage_to_x_items, is_active, note)
VALUES ('ochutnej', 'fixed_product', 90, true, true, ARRAY['ochutnavkovy-set-sirupu']::text[],
  100, 1, 1, false, 'Kampaň Ochutnávkový set 159 Kč + poštovné zdarma, prvních 100 (Josef)')
ON CONFLICT (code) DO NOTHING;

COMMIT;
