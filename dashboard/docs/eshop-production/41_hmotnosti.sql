-- HMOTNOSTI BALENÍ pro cenu chlazené přepravy: sloupec product_variants.weight_g
-- (= drizzle 0021_eshop_1_0_variant_weight) + 36 ověřených hmotností.
-- Návrh 11. 10. 2026; spuštění NESCHVÁLENO. Postup: docs/eshop-doprava/spusteni.md.
--
-- Zdroj hmotností: WooCommerce begina.cz („Další informace → Hmotnost“ a data
-- variant na veřejných stránkách produktů, čteno 11. 10. 2026):
--   3 l (polévky, čaje, sirupy, koktejly) = 3 kg · sirup 750 g = 0,75 kg ·
--   koktejl 500 ml = 0,5 kg. Hmotnost je jmenovitá (bez obalu a chladicí
--   tašky) — stejná, ze které počítal Flexible Shipping ve WooCommerce.
-- Skrytá balení (Ovocné nápoje) zůstávají bez hmotnosti; Dům u jezera ji
-- ve WooCommerce nemá. Bez hmotnosti = chlazenou přepravu nejde spočítat.
--
-- Sám o sobě nic nezapíná: e-shop hmotnosti čte až s ESHOP_WEIGHT_SHIPPING=on.
-- Celý blok je jedna transakce: jakákoli pojistka nebo chyba → nic se nezmění.
-- Kontrola po: 42_hmotnosti_after.sql. Návrat: 49_hmotnosti_rollback.sql.
DO $$
DECLARE
  updated int;
  missing text;
BEGIN
  -- Pojistky
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'weight_g') THEN
    RAISE EXCEPTION 'Sloupec product_variants.weight_g už existuje (skript už běžel?) — zastavuji.';
  END IF;

  CREATE TEMP TABLE hmotnosti (sku text PRIMARY KEY, weight_g integer NOT NULL) ON COMMIT DROP;
  INSERT INTO hmotnosti (sku, weight_g) VALUES
    -- Čerstvé polévky 3 l
    ('kulajda', 3000),
    ('dynova-polevka', 3000),
    ('gulasova-polevka-z-hlivy-ustricne', 3000),
    ('rajcatova-polevka', 3000),
    ('rajcatova-polevka-s-cervenou-repou', 3000),
    ('spenatova-polevka', 3000),
    -- Čaje 3 l
    ('bylinny-caj-saman-3l', 3000),
    ('cerny-caj-golden-nepal-3l', 3000),
    ('hermankovy-caj-3l', 3000),
    ('ibiskovy-caj-3l', 3000),
    ('jasminovy-zeleny-caj-3l', 3000),
    ('lipovy-caj-3l', 3000),
    ('medunkovy-caj-s-levanduli-3l', 3000),
    ('zazvorovy-caj-3l', 3000),
    -- Bylinné sirupy 3 l
    ('bylinny-sirup-saman-3l', 3000),
    ('hermankovy-sirup-3l', 3000),
    ('ibiskovy-sirup-3l', 3000),
    ('lipovy-sirup-3l', 3000),
    ('medunkovy-sirup-s-levanduli-3l', 3000),
    ('sipkovy-sirup-3l', 3000),
    ('zazvorovy-sirup-3l', 3000),
    -- Bylinné sirupy 750 g
    ('bylinny-sirup-saman-750ml', 750),
    ('hermankovy-sirup-750ml', 750),
    ('ibiskovy-sirup-750ml', 750),
    ('lipovy-sirup-750ml', 750),
    ('medunkovy-sirup-s-levanduli-750ml', 750),
    ('sipkovy-sirup-750ml', 750),
    ('zazvorovy-sirup-750ml', 750),
    -- Koktejly 3 l
    ('svarak-deluxe-3l', 3000),
    ('lady-carneval-3l', 3000),
    ('granatovy-bond-3l', 3000),
    ('kosmopolitan-3l', 3000),
    -- Koktejly 500 ml
    ('svarak-deluxe-500ml', 500),
    ('lady-carneval-500ml', 500),
    ('granatovy-bond-500ml', 500),
    ('kosmopolitan-500ml', 500);

  SELECT string_agg(h.sku, ', ' ORDER BY h.sku) INTO missing
    FROM hmotnosti h LEFT JOIN product_variants v ON v.sku = h.sku AND v.is_active
   WHERE v.id IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Tato SKU v katalogu chybí nebo nejsou aktivní: % — zastavuji.', missing;
  END IF;

  -- = drizzle/0021_eshop_1_0_variant_weight.sql
  ALTER TABLE "product_variants" ADD COLUMN "weight_g" integer;
  ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_weight_positive" CHECK ("product_variants"."weight_g" > 0);

  UPDATE product_variants v SET weight_g = h.weight_g, updated_at = now()
    FROM hmotnosti h WHERE v.sku = h.sku;
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated <> 36 THEN
    RAISE EXCEPTION 'Doplněno % hmotností místo 36 — zastavuji.', updated;
  END IF;
END $$;
