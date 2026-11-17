-- 129: Kampaň Ochutnávkový set – slevový kód OCHUTNAVKA50 a evidence e-mailů s kódem.
--   1) tabulka set_coupon_emails: kterým objednávkám už e-mail s kódem odešel (jen jednou),
--   2) kód ochutnavka50: sleva 50 Kč z košíku, nákup zboží od 199 Kč (bez dopravy),
--      nevztahuje se na ochutnávkový set, jednou na zákazníka (podle e-mailu),
--      platí do 31. 3. 2027 včetně, nelze kombinovat s jiným kódem.
-- Nic existujícího se nemění. Dá se spustit opakovaně.
BEGIN;
DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS "set_coupon_emails" (
  "order_id" uuid PRIMARY KEY NOT NULL REFERENCES "orders"("id"),
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
INSERT INTO eshop_coupons (code, discount_type, amount, free_shipping, expires_at, minimum_amount_kc, individual_use,
                           excluded_product_slugs, usage_limit_per_user, is_active, note)
VALUES ('ochutnavka50', 'fixed_cart', 50, false, '2027-03-31 23:59:59+02', 199, true,
        ARRAY['ochutnavkovy-set-sirupu'], 1, true,
        'Kampaň Ochutnávkový set: 50 Kč na další nákup, chodí e-mailem 5 dní po odeslání setu (17. 11. 2026).')
ON CONFLICT (code) DO NOTHING;
COMMIT;
SELECT code, discount_type, amount, minimum_amount_kc, individual_use, excluded_product_slugs, usage_limit_per_user, expires_at
FROM eshop_coupons WHERE code = 'ochutnavka50';
