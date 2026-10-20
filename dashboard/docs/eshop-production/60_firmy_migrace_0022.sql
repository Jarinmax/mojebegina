-- FIRMY NA FAKTUŘE: DIČ firmy + jedna objednávka z WooCommerce = jeden záznam
-- (= drizzle 0022_eshop_1_0_company_invoicing). Návrh 19. 10. 2026;
-- spuštění NESCHVÁLENO. Postup: docs/eshop-production/FOOD_FEST_5215.md.
--
-- Nic nemaže ani nepřepisuje: nový prázdný sloupec organizations.dic (s kontrolou
-- tvaru CZ12345678) a unikátní index na orders.external_woocommerce_id (dnes
-- všude NULL). Celý blok je jedna transakce: pojistka nebo chyba → nic se nezmění.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'dic') THEN
    RAISE EXCEPTION 'Sloupec organizations.dic už existuje (migrace už běžela?) — zastavuji.';
  END IF;
  IF EXISTS (SELECT external_woocommerce_id FROM orders WHERE external_woocommerce_id IS NOT NULL
             GROUP BY external_woocommerce_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicitní external_woocommerce_id v orders — zastavuji.';
  END IF;

  ALTER TABLE "organizations" ADD COLUMN "dic" text;
  CREATE UNIQUE INDEX "orders_external_woocommerce_id_key" ON "orders" USING btree ("external_woocommerce_id");
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_dic_format"
    CHECK ("organizations"."dic" IS NULL OR "organizations"."dic" ~ '^[A-Z]{2}[0-9A-Z]{2,13}$');
  RAISE NOTICE 'Hotovo: organizations.dic + unikátní external_woocommerce_id.';
END $$;

-- Návrat (jen dokud se DIČ ani číslo z WooCommerce nepoužívá):
-- DROP INDEX orders_external_woocommerce_id_key;
-- ALTER TABLE organizations DROP CONSTRAINT organizations_dic_format;
-- ALTER TABLE organizations DROP COLUMN dic;
