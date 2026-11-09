-- Bylinné sirupy (všech 7) — balení a Informace o potravině (9. 11. 2026):
--   • varianty: „Begina 3 l“ → „3 l“, „750 g“ → „700 ml“ (objem 700 ml,
--     až 35 nápojů při ředění 1 : 10); hmotnost pro dopravu (weight_g),
--     ceny, SKU a historické objednávky beze změny,
--   • Skladování a Trvanlivost — texty podle zadání (Příprava a Vrácení
--     a reklamace doplňuje šablona v kódu, lib/eshop/syrupFoodInfo.ts),
--   • z popisu pryč „Zlaté pravidlo Beginy … 20 ml sirupu na 200 ml vody“
--     (ředění je nově v řádku Příprava, neopakuje se ve starém znění).
-- Ostatní kategorie beze změny (hlídá otisk).
--
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production). Jedna
-- transakce: když pojistka nesedí, NEZMĚNÍ SE NIC.
BEGIN;

DO $$
DECLARE
  np int; nv3 int; nv7 int;
  others_before text;
  weights_before text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  SELECT md5(string_agg(p::text || coalesce((SELECT string_agg(v::text, '|' ORDER BY v.sku) FROM product_variants v WHERE v.product_id = p.id), ''), '#' ORDER BY p.slug))
    INTO others_before FROM products p JOIN product_categories c ON c.id = p.category_id WHERE c.slug <> 'sirupy';
  SELECT string_agg(v.sku || ':' || coalesce(v.weight_g::text, '-') || ':' || v.price_b2c_kc, ',' ORDER BY v.sku)
    INTO weights_before FROM product_variants v JOIN products p ON p.id = v.product_id JOIN product_categories c ON c.id = p.category_id WHERE c.slug = 'sirupy';

  UPDATE products p
     SET storage_instructions = 'Před otevřením skladujte v suchu a temnu při teplotě do 20 °C. Po otevření uchovávejte v chladničce při teplotě do 4 °C.',
         shelf_life_note = 'Minimální trvanlivost do data uvedeného na obalu. Po otevření spotřebujte do 3 měsíců při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.',
         description = array_remove(array_remove(description,
           '**Zlaté pravidlo Beginy:** doporučený poměr je **1:10**'),
           'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.'),
         updated_at = now()
    FROM product_categories c
   WHERE c.id = p.category_id AND c.slug = 'sirupy';
  GET DIAGNOSTICS np = ROW_COUNT;
  IF np <> 7 THEN RAISE EXCEPTION 'Čekal jsem 7 sirupů, změnil bych % — zastavuji.', np; END IF;

  UPDATE product_variants v SET label = '3 l', updated_at = now()
    FROM products p JOIN product_categories c ON c.id = p.category_id
   WHERE v.product_id = p.id AND c.slug = 'sirupy' AND v.label = 'Begina 3 l' AND v.volume_ml = 3000;
  GET DIAGNOSTICS nv3 = ROW_COUNT;
  UPDATE product_variants v SET label = '700 ml', volume_ml = 700, servings = 35, short_note = 'Až 35 nápojů', updated_at = now()
    FROM products p JOIN product_categories c ON c.id = p.category_id
   WHERE v.product_id = p.id AND c.slug = 'sirupy' AND v.label IN ('750 g', '750 ml') AND v.sku LIKE '%-750ml';
  GET DIAGNOSTICS nv7 = ROW_COUNT;
  IF nv3 <> 7 OR nv7 <> 7 THEN RAISE EXCEPTION 'Čekal jsem 7 + 7 variant, změnil bych % + % — zastavuji.', nv3, nv7; END IF;

  IF EXISTS (SELECT 1 FROM products p JOIN product_categories c ON c.id = p.category_id
              WHERE c.slug = 'sirupy' AND (array_to_string(p.description, ' ') ~ 'Zlaté pravidlo|20 ml sirupu' OR p.shelf_life_note IS NULL
                    OR p.storage_instructions ~ '25 °C|dobře uzavřeném|Před použitím protřepejte')) THEN
    RAISE EXCEPTION 'Texty sirupů po úpravě nesedí — zastavuji, nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM product_variants v JOIN products p ON p.id = v.product_id JOIN product_categories c ON c.id = p.category_id
              WHERE c.slug = 'sirupy' AND (v.label NOT IN ('3 l', '700 ml') OR concat_ws(' ', v.label, v.short_note, v.package_description) ~ '750|Begina 3 l')) THEN
    RAISE EXCEPTION 'Označení balení sirupů po úpravě nesedí — zastavuji, nic se nezměnilo.';
  END IF;
  IF weights_before IS DISTINCT FROM (SELECT string_agg(v.sku || ':' || coalesce(v.weight_g::text, '-') || ':' || v.price_b2c_kc, ',' ORDER BY v.sku)
       FROM product_variants v JOIN products p ON p.id = v.product_id JOIN product_categories c ON c.id = p.category_id WHERE c.slug = 'sirupy') THEN
    RAISE EXCEPTION 'Změnila by se hmotnost, cena nebo SKU — zastavuji, nic se nezměnilo.';
  END IF;
  IF others_before IS DISTINCT FROM (SELECT md5(string_agg(p::text || coalesce((SELECT string_agg(v::text, '|' ORDER BY v.sku) FROM product_variants v WHERE v.product_id = p.id), ''), '#' ORDER BY p.slug))
       FROM products p JOIN product_categories c ON c.id = p.category_id WHERE c.slug <> 'sirupy') THEN
    RAISE EXCEPTION 'Změnila by se jiná kategorie — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: 7 sirupů — balení 3 l a 700 ml, skladování a trvanlivost.';
END $$;

COMMIT;

-- Kontrola po (spustit zvlášť):
-- SELECT v.sku, v.label, v.short_note, v.weight_g FROM product_variants v WHERE v.sku LIKE '%sirup%' ORDER BY 1;
