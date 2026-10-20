-- FOOD FEST CREW + objednávka WooCommerce #5215 — jedním skriptem, bez ručního přepisování.
-- Návrh 20. 10. 2026; spuštění na Neon main NESCHVÁLENO. Postup: FOOD_FEST_5215.md.
-- Nahrazuje ruční převod leadu v aplikaci + skript 62.
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
-- Zapíše:
--   1. firmu Food Fest Crew s.r.o. (IČO, DIČ, sídlo „Pasohlávky 251, 691 22 Pasohlávky“,
--      obchodník a získal z leadu) — stejně jako „Převést na zákazníka“, ale BEZ
--      uživatelského účtu: Tomáš nedostane účet, heslo ani pozvánku,
--   2. lead Tomáše Herouta (cb5b6742…) → převedený, propojený s firmou, záznam
--      „převeden“ v historii leadu (lead zůstává),
--   3. objednávku (channel „import“, external_woocommerce_id 5215, firma, kontakt),
--      1 položku, 1 přijatou platbu kartou a záznam do historie objednávky.
-- NIC nevystavuje — faktura vznikne až tlačítkem „Vystavit fakturu v iDokladu“ (VS 5215).
-- Jeden blok = jedna transakce: jakákoli pojistka nebo chyba → nic se nezmění.
DO $$
DECLARE
  lead_row leads%ROWTYPE;
  org_id uuid;
  new_order_id uuid;
  paid timestamptz := '2026-10-19 06:23:00+02';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'dic') THEN
    RAISE EXCEPTION 'Chybí organizations.dic — nejdřív 60_firmy_migrace_0022.sql.';
  END IF;
  IF EXISTS (SELECT 1 FROM organizations WHERE ico = '08911088') THEN
    RAISE EXCEPTION 'Firma s IČO 08911088 už v MojeBegina je — zastavuji, nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE external_woocommerce_id = '5215') THEN
    RAISE EXCEPTION 'Objednávka WooCommerce 5215 už v MojeBegina je — zastavuji, nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM invoice_customers WHERE ico = '08911088') THEN
    RAISE EXCEPTION 'Fakturační zákazník s IČO 08911088 už existuje — zastavuji k ruční kontrole.';
  END IF;
  IF (SELECT count(*) FROM leads WHERE lower(contact_email) = 'tom.herout@seznam.cz') <> 1 THEN
    RAISE EXCEPTION 'Čekám právě 1 lead s e-mailem tom.herout@seznam.cz — zastavuji.';
  END IF;
  SELECT * INTO lead_row FROM leads
   WHERE id = 'cb5b6742-8031-40c9-9ac3-7456a946f061' AND lower(contact_email) = 'tom.herout@seznam.cz'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead Tomáše Herouta (cb5b6742…, tom.herout@seznam.cz) nenalezen — zastavuji.';
  END IF;
  IF lead_row.converted_organization_id IS NOT NULL OR lead_row.stage = 'converted' THEN
    RAISE EXCEPTION 'Lead Tomáše Herouta už je převedený — zastavuji, nic se nezměnilo.';
  END IF;

  -- 1. firma (stejné hodnoty jako „Převést na zákazníka“ → založit nového zákazníka)
  INSERT INTO organizations (ico, name, registered_address, dic, status, owner_user_id, acquired_by_user_id)
  VALUES ('08911088', 'Food Fest Crew s.r.o.', 'Pasohlávky 251, 691 22 Pasohlávky', 'CZ08911088',
          'Zákazník Begina', lead_row.owner_user_id, lead_row.acquired_by_user_id)
  RETURNING id INTO org_id;

  -- 2. lead → převedený na firmu (lead zůstává, jen se propojí)
  UPDATE leads SET converted_organization_id = org_id, stage = 'converted', updated_at = now()
   WHERE id = lead_row.id;
  INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, metadata)
  VALUES (lead_row.id, 'import:woocommerce', 'Import WooCommerce (skript 65)', 'converted',
          jsonb_build_object('organizationId', org_id, 'linkedExisting', false,
                             'source', 'script:65', 'previousStage', lead_row.stage));

  -- 3. objednávka WooCommerce #5215 (stejně jako skript 62)
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
  RAISE NOTICE 'Hotovo: Food Fest Crew s.r.o. založena, lead Tomáše Herouta převeden, objednávka 5215 zaplacená kartou, bez faktury.';
END $$;
