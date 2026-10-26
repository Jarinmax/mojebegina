-- IMPORT objednávky WooCommerce #5217 (Perconto invest s.r.o.) do MojeBegina.
-- Důvod: automatický import z WooCommerce v době objednávky ještě neexistoval
-- (webhook app/api/eshop/woocommerce/webhook vznikl až touhle oprava) — tohle
-- je jednorázové ruční doplnění PŘESNĚ stejnými hodnotami a stejnými sloupci,
-- jaké by zapsalo importExternalOrder (lib/data/orders.ts), žádná paralelní
-- logika. Postup: 64_before (kontrola) → tento skript → 66_after (kontrola).
--
-- Zdroj (zadání Jardy, karta zákazníka Perconto invest s.r.o., organization_id
-- 3d7c57e0-510d-4cb3-8883-5662fe592a77, IČO 05249937):
--   Objednávka WooCommerce č. 5217, vytvořena 25. 10. 2026 ve 23:12 (Praha).
--   25. 10. 2026 je v ČR den přechodu ze SEČ na SEČ (konec letního času) —
--   ve 23:12 už platí SEČ (UTC+1), ne SELČ. V UTC je to tedy 2026-10-25 22:12,
--   níž zapsáno jako timestamptz s explicitním posunem +01, aby nezáleželo na
--   tom, v jakém časovém pásmu tento skript někdo spustí.
--   Kontakt: Jiří Průcha, jir.prucha@seznam.cz (telefon v zadání nebyl).
--   Dodání: Karla Steinera 1758/12, 318 00 Plzeň.
--   Platba: bankovní převod předem (platba NENÍ potvrzená — payment_status
--     zůstává 'unpaid', žádný řádek v payments; VS appka nevymýšlí, 'import'
--     ho nepožaduje).
--   Položky: 2× Dýňová polévka (758 Kč), 2× Gulášová polévka z hlívy (758 Kč),
--     1× Rajčatová polévka (379 Kč), 3× Kulajda (1 137 Kč), 1× Špenátová
--     polévka (379 Kč) — mezisoučet 3 411 Kč.
--   Sleva −102,33 Kč; chlazená doprava 491 Kč; celkem dle WooCommerce 3 799,67 Kč.
--
-- POZOR — zaokrouhlení (vědomé, shodné s webhookem, roundToWholeKc v
-- lib/woocommerce/webhook.ts): orders.discount_kc i orders.total_kc
-- jsou integer (celé Kč, bez haléřů; constraint orders_total_consistent).
-- Sleva 102,33 Kč se zaokrouhlí na 102 Kč → total_kc = 3411 − 102 + 491 = 3800 Kč,
-- tj. 0,33 Kč VÍC než skutečná částka z WooCommerce (3 799,67 Kč). Nepatrný a
-- neopravitelný rozdíl v rámci dnešního schématu (bez haléřů) — nikdy se tiše
-- neztratí: je to tu, v komentáři webhooku i v hlášení Jardovi, ne jen v kódu.
--
-- Jeden blok = jedna transakce: jakákoli pojistka nebo chyba → nic se nezmění.
DO $$
DECLARE
  org_id uuid := '3d7c57e0-510d-4cb3-8883-5662fe592a77';
  new_order_id uuid;
  ordered timestamptz := '2026-10-25 23:12:00+01';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = org_id AND ico = '05249937') THEN
    RAISE EXCEPTION 'Organizace % s IČO 05249937 nebyla nalezena přesně — zastavuji.', org_id;
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE external_woocommerce_id = '5217') THEN
    RAISE EXCEPTION 'Objednávka WooCommerce 5217 už v MojeBegina je — zastavuji, nic se nezměnilo.';
  END IF;

  INSERT INTO orders (
    channel, external_woocommerce_id, buyer_organization_id,
    contact_name, contact_phone, contact_email,
    recipient_name, recipient_address, recipient_phone, customer_note, note,
    shipping_method_label, payment_method_code, payment_method_label,
    subtotal_kc, discount_kc, shipping_kc, total_kc,
    payment_status, fulfillment_status, ordered_at
  ) VALUES (
    'import', '5217', org_id,
    'Jiří Průcha', NULL, 'jir.prucha@seznam.cz',
    'Jiří Průcha', 'Karla Steinera 1758/12, 318 00 Plzeň', NULL, NULL,
    'Import z WooCommerce (begina.cz) #5217 — ruční doplnění po výpadku automatického importu; sleva 102,33 Kč zaokrouhlena na 102 Kč (orders.discount_kc je integer, viz komentář nahoře).',
    'Chlazená přeprava', 'bacs', 'Bankovní převod předem',
    3411, 102, 491, 3800,
    'unpaid', 'new', ordered
  ) RETURNING id INTO new_order_id;

  INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc) VALUES
    (new_order_id, 'Dýňová polévka', 2, 379, 758),
    (new_order_id, 'Gulášová polévka z hlívy', 2, 379, 758),
    (new_order_id, 'Rajčatová polévka', 1, 379, 379),
    (new_order_id, 'Kulajda', 3, 379, 1137),
    (new_order_id, 'Špenátová polévka', 1, 379, 379);

  INSERT INTO order_activity (order_id, actor_type, author_name, kind, body)
  VALUES (new_order_id, 'system', 'Ruční import (výpadek webhooku)', 'created',
          'Importováno z WooCommerce #5217 — automatický webhook v době objednávky ještě neexistoval, doplněno stejnou produkční logikou (importExternalOrder) ručním SQL skriptem.');

  RAISE NOTICE 'Hotovo: objednávka WooCommerce 5217 (Perconto invest s.r.o.) v MojeBegina, nezaplacená (bankovní převod předem čeká na potvrzení), bez faktury.';
END $$;
