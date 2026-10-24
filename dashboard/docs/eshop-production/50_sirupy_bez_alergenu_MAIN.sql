-- Sirupy do prodeje: alergeny „ověřeno — bez povinně uváděných alergenů“
-- (products.allergens = '{}'). NULL = neověřeno = „Připravujeme“, nejde do
-- košíku (lib/eshop/productRules.ts → isOrderable). Rozhodnutí majitele
-- 14. 10. 2026. Složení všech 7 sirupů (čteno z main 14. 10.): třtinový
-- cukr, bylinný výluh (voda + byliny), citronová šťáva, kyselina askorbová.
--
-- Spustit celý v Neon SQL Editoru na větvi main. Jeden blok = jedna
-- transakce: když cokoli nesedí, nezmění se nic.
DO $$
DECLARE
  changed int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE products p
  SET allergens = '{}', updated_at = now()
  FROM product_categories c
  WHERE c.id = p.category_id
    AND c.slug = 'sirupy'
    AND p.allergens IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;

  IF changed <> 7 THEN
    RAISE EXCEPTION 'Čekám 7 sirupů s neověřenými alergeny, našel jsem % — zastavuji, nic se nezměnilo.', changed;
  END IF;
  RAISE NOTICE 'Hotovo: 7 sirupů bez alergenů, lze je objednat.';
END $$;

-- Návrat (jen kdyby bylo potřeba sirupy znovu zablokovat):
-- UPDATE products p SET allergens = NULL, updated_at = now()
-- FROM product_categories c WHERE c.id = p.category_id AND c.slug = 'sirupy' AND p.allergens = '{}';
