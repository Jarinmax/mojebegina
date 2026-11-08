-- Objednávka 70000009 (Cukrárna Kavárna Adélka) — doplnění fakturačních
-- údajů a vazby na zákaznickou kartu (8. 11. 2026).
--
-- Zdroj: faktury iDokladu č. 20260186 a 20260198 (PDF v Gmailu), které
-- Lucie dohledala a ověřila — obě shodně:
--   Odběratel Lenka Odrazilová, Dlouhá 113, 254 01 Jílové u Prahy,
--   IČO 74797921, DIČ CZ7557210705; dodací adresa Cukrárna Kavárna Adélka,
--   Matúškova 831/1, 149 00 Praha 4-Háje.
-- Vazba na kartu: objednávku poslal e-mail, který je na kartě
-- „Cukrárna Kavárna Adélka“ (IČO 74797921) zapsaný jako vlastník účtu,
-- a dodací adresa je výchozí provozovna té karty.
--
-- Mění se JEN: fakturační údaje objednávky, firma příjemce, vazba na kartu
-- a chybějící DIČ na kartě. NEMĚNÍ se platba, částky, položky, VS ani stav;
-- žádná faktura se nevystavuje.
--
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production). Jedna
-- transakce: když kterákoli pojistka nesedí, NEZMĚNÍ SE NIC.
BEGIN;

DO $$
DECLARE
  org_id uuid := 'bd1e09a1-ed86-4327-ab56-163e5e7486f5';
  ord_id uuid;
  n int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  -- karta: IČO 74797921, DIČ zatím prázdné
  IF NOT EXISTS (SELECT 1 FROM "organizations" WHERE "id" = org_id AND "ico" = '74797921' AND ("dic" IS NULL OR "dic" = 'CZ7557210705')) THEN
    RAISE EXCEPTION 'Karta Cukrárna Kavárna Adélka (IČO 74797921) nesedí — zastavuji, nic se nezměnilo.';
  END IF;

  -- objednávka: e-shop, bez fakturačních údajů, bez karty, bez faktury,
  -- kontaktní e-mail = vlastník účtu na kartě, dodací adresa = provozovna
  SELECT o."id" INTO ord_id
  FROM "orders" o
  WHERE o."order_number" = 70000009
    AND o."channel" = 'eshop'
    AND o."buyer_organization_id" IS NULL
    AND o."billing_street" IS NULL
    AND o."recipient_address" = 'Matúškova 831/1, 149 00 Praha 4-Háje'
    AND EXISTS (
      SELECT 1 FROM "organization_memberships" m
      JOIN "user_profiles" p ON p."user_id" = m."user_id"
      WHERE m."organization_id" = org_id AND lower(p."email") = lower(o."contact_email")
    )
    AND NOT EXISTS (SELECT 1 FROM "invoices" i WHERE i."order_id" = o."id");
  IF ord_id IS NULL THEN
    RAISE EXCEPTION 'Objednávka 70000009 nesedí (už doplněná, jiný e-mail, faktura?) — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE "orders" SET
    "buyer_organization_id" = org_id,
    "billing_name" = 'Lenka Odrazilová',
    "billing_company" = 'Lenka Odrazilová',
    "billing_ico" = '74797921',
    "billing_dic" = 'CZ7557210705',
    "billing_street" = 'Dlouhá 113',
    "billing_city" = 'Jílové u Prahy',
    "billing_zip" = '254 01',
    "billing_country" = 'Česká republika',
    "recipient_company" = 'Cukrárna Kavárna Adélka',
    "delivery_same_as_billing" = false
  WHERE "id" = ord_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Čekal jsem 1 objednávku, změnil bych % — zastavuji.', n; END IF;

  UPDATE "organizations" SET "dic" = 'CZ7557210705' WHERE "id" = org_id AND "dic" IS NULL;

  INSERT INTO "order_activity" ("order_id", "actor_type", "author_user_id", "author_name", "kind", "metadata")
  VALUES (ord_id, 'system', NULL, 'Begina (ruční oprava)', 'billing_details_completed',
    jsonb_build_object('source', 'faktury iDoklad 20260186 a 20260198 (ověřila Lucie 8. 11. 2026)', 'organizationId', org_id));

  RAISE NOTICE 'Hotovo: objednávka 70000009 má fakturační údaje a je u karty Cukrárna Kavárna Adélka. Platba ani faktura se neměnily.';
END $$;

COMMIT;

-- Kontrola po (spustit zvlášť):
-- SELECT order_number, billing_company, billing_ico, billing_street, billing_zip, billing_city,
--        recipient_company, buyer_organization_id IS NOT NULL AS karta, payment_status, total_kc
-- FROM orders WHERE order_number = 70000009;
