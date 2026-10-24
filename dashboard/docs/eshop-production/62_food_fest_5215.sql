-- IMPORT objednávky WooCommerce #5215 (Food Fest Crew s.r.o.) do MojeBegina.
-- Návrh 19. 10. 2026; spuštění NESCHVÁLENO. Postup: FOOD_FEST_5215.md.
--
-- Zdroj (WooCommerce, detail objednávky #5215, čteno 19. 10. 2026):
--   Fakturace: Food Fest Crew s.r.o., Tomáš Herout, 251, 691 22 Pasohlávky,
--     IČO 08911088, DIČ CZ08911088, tom.herout@seznam.cz, +420723141743
--   Doprava: Tomáš Herout, 251, 691 22 Pasohlávky; poznámka zákazníka:
--     „Prosím o dovoz do Drnholce do areálu Světa bludišť , děkuji.“
--   Položky: Dýňová polévka 379,00 Kč × 30 = 11 370 Kč; Chlazená přeprava 1 277 Kč
--   Celkem 12 647 Kč — zaplaceno 19. 10. 2026 v 6:23 kartou (WooPayments
--   pi_3US86dCEhzAMgcfb0ufGppo3); stav ve WooCommerce „Zpracovává se“.
--
-- Zapíše: DIČ firmy (jen když je prázdné), objednávku (channel „import“,
-- external_woocommerce_id 5215, firma, kontakt), 1 položku, 1 přijatou platbu
-- kartou a záznam do historie. NIC nevystavuje — faktura vznikne až tlačítkem
-- „Vystavit fakturu v iDokladu“ (VS faktury = 5215).
-- Jeden blok = jedna transakce: jakákoli pojistka nebo chyba → nic se nezmění.
DO $$
DECLARE
  org_id uuid;
  org_count int;
  new_order_id uuid;
  paid timestamptz := '2026-10-19 06:23:00+02';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'dic') THEN
    RAISE EXCEPTION 'Chybí organizations.dic — nejdřív 60_firmy_migrace_0022.sql.';
  END IF;
  SELECT count(*) INTO org_count FROM organizations WHERE ico = '08911088';
  IF org_count <> 1 THEN
    RAISE EXCEPTION 'Čekám právě 1 firmu s IČO 08911088 (převod leadu Tomáše Herouta), našel jsem % — zastavuji.', org_count;
  END IF;
  SELECT id INTO org_id FROM organizations WHERE ico = '08911088';
  IF EXISTS (SELECT 1 FROM orders WHERE external_woocommerce_id = '5215') THEN
    RAISE EXCEPTION 'Objednávka WooCommerce 5215 už v MojeBegina je — zastavuji, nic se nezměnilo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = org_id AND registered_address ~ ',\s*[0-9]{3}\s?[0-9]{2}\s+\S') THEN
    RAISE EXCEPTION 'Sídlo firmy nejde rozdělit na ulici, PSČ a město (čekám „Pasohlávky 251, 691 22 Pasohlávky“) — zastavuji.';
  END IF;
  IF EXISTS (SELECT 1 FROM organizations WHERE id = org_id AND dic IS NOT NULL AND dic <> 'CZ08911088') THEN
    RAISE EXCEPTION 'Firma má jiné DIČ, než uvádí objednávka (CZ08911088) — zastavuji.';
  END IF;

  UPDATE organizations SET dic = 'CZ08911088' WHERE id = org_id AND dic IS NULL;

  INSERT INTO orders (
    channel, external_woocommerce_id, buyer_organization_id,
    contact_name, contact_phone, contact_email,
    recipient_name, recipient_address, recipient_phone, customer_note, note,
    shipping_method_label, payment_method_code, payment_method_label,
    subtotal_kc, discount_kc, shipping_kc, total_kc,
    payment_status, paid_at, fulfillment_status, ordered_at
  ) VALUES (
    'import', '5215', org_id,
    'Tomáš Herout', '+420723141743', 'tom.herout@seznam.cz',
    'Tomáš Herout', '251, 691 22 Pasohlávky', '+420723141743',
    'Prosím o dovoz do Drnholce do areálu Světa bludišť , děkuji.',
    'Import z WooCommerce (begina.cz) #5215, platba WooPayments pi_3US86dCEhzAMgcfb0ufGppo3.',
    'Chlazená přeprava', 'karta', 'Platební karta (WooCommerce)',
    11370, 0, 1277, 12647,
    'paid', paid, 'confirmed', paid
  ) RETURNING id INTO new_order_id;

  INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc)
  VALUES (new_order_id, 'Dýňová polévka', 30, 379, 11370);

  INSERT INTO payments (order_id, source, external_id, method, direction, status, amount_hal, vs,
                        occurred_at, recorded_by_user_id, note, raw)
  VALUES (new_order_id, 'manual', 'woocommerce:5215', 'card', 'inflow', 'succeeded', 1264700, '5215',
          paid, 'import:woocommerce', 'Kartou přes WooPayments (WooCommerce #5215)',
          '{"wooOrderId": "5215", "paymentIntent": "pi_3US86dCEhzAMgcfb0ufGppo3"}'::jsonb);

  INSERT INTO order_activity (order_id, actor_type, author_name, kind, metadata)
  VALUES (new_order_id, 'system', 'Import WooCommerce', 'created',
          '{"source": "woocommerce", "externalId": "5215", "paidHal": 1264700}'::jsonb);

  IF (SELECT balance_state FROM order_payment_balance WHERE order_payment_balance.order_id = new_order_id) <> 'paid' THEN
    RAISE EXCEPTION 'Platba nesedí s cenou objednávky — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: objednávka WooCommerce 5215 (Food Fest Crew) v MojeBegina, zaplacená kartou, bez faktury.';
END $$;
