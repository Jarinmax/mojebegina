-- Koktejly do prodeje: ověřené alergeny (products.allergens). NULL =
-- neověřeno = „Připravujeme“ (lib/eshop/productRules.ts → isOrderable).
-- SPUSTIT AŽ PO POTVRZENÍ MAJITELE (alergeny podle etiket surovin):
--   svarak-deluxe   → siřičitany (červené víno)            = '{sulphites}'
--   lady-carneval   → bez povinně uváděných alergenů        = '{}'
--   granatovy-bond  → bez povinně uváděných alergenů        = '{}'
--   kosmopolitan    → bez povinně uváděných alergenů        = '{}'
-- Všechny 4 jsou alkoholické (6,3–7,5 % obj.) a 18+: pokladna vyžaduje
-- potvrzení věku, objednávka ho ukládá, věk se ověřuje při předání.
--
-- Spustit celý v Neon SQL Editoru na větvi main. Jeden blok = jedna
-- transakce: když cokoli nesedí, nezmění se nic. Ostatní produkty beze změny.
DO $$
DECLARE
  changed int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE products p
  SET allergens = v.allergens, updated_at = now()
  FROM product_categories c,
       (VALUES
         ('svarak-deluxe',  ARRAY['sulphites']::text[]),
         ('lady-carneval',  ARRAY[]::text[]),
         ('granatovy-bond', ARRAY[]::text[]),
         ('kosmopolitan',   ARRAY[]::text[])
       ) AS v(slug, allergens)
  WHERE c.id = p.category_id
    AND c.slug = 'koktejly'
    AND p.slug = v.slug
    AND p.allergens IS NULL
    AND p.is_age_restricted
    AND p.alcohol_percent IS NOT NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;

  IF changed <> 4 THEN
    RAISE EXCEPTION 'Čekám 4 koktejly (18+, s neověřenými alergeny), našel jsem % — zastavuji, nic se nezměnilo.', changed;
  END IF;
  RAISE NOTICE 'Hotovo: 4 koktejly s ověřenými alergeny, lze je objednat (18+).';
END $$;

-- Návrat (koktejly znovu „Připravujeme“):
-- UPDATE products p SET allergens = NULL, updated_at = now()
-- FROM product_categories c WHERE c.id = p.category_id AND c.slug = 'koktejly'
--   AND p.slug IN ('svarak-deluxe', 'lady-carneval', 'granatovy-bond', 'kosmopolitan');
