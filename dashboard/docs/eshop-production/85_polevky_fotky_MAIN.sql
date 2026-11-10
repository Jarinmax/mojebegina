-- Polévky — nové fotografie na bílém podkladu (10. 11. 2026):
--   1. miska se surovinami = hlavní fotka (katalog, detail, související
--      produkty, náhled při sdílení), 2. sáček s kohoutkem = druhá fotka
--      v galerii. Kategorie Polévky dostane hlavní fotku Dýňové polévky.
-- Původní tmavé fotky s krabicí se jen přestanou zobrazovat — soubory
-- public/eshop/<slug>.jpg v kódu zůstávají (vrácení níže).
-- Texty, ceny, složení ani nic jiného se NEMĚNÍ.
--
-- SPUSTIT až po nasazení kódu s fotkami (PR „Polévky: nové fotografie“).
-- CELÝ v Neon SQL Editoru na větvi main (Production). Jedna transakce:
-- když pojistka nesedí, NEZMĚNÍ SE NIC.
--
-- Vrácení (kdyby bylo potřeba):
--   DELETE FROM product_images WHERE url LIKE '/eshop/polevky/%-sacek.jpg';
--   UPDATE product_images SET url = replace(replace(url, '/eshop/polevky/', '/eshop/'), '-miska.jpg', '.jpg') WHERE url LIKE '/eshop/polevky/%-miska.jpg';
--   UPDATE product_categories SET image_url = '/eshop/kategorie-polevky.jpg' WHERE slug = 'polevky';
BEGIN;

DO $$
DECLARE
  n int;
  changed int := 0;
  added int := 0;
  rest_before text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
  SELECT md5(string_agg(p.slug || '|' || pi.url || '|' || pi.sort_order, '#' ORDER BY p.slug, pi.url)) INTO rest_before
    FROM product_images pi JOIN products p ON p.id = pi.product_id JOIN product_categories c ON c.id = p.category_id
   WHERE c.slug <> 'polevky';

  UPDATE product_images SET url = '/eshop/polevky/dynova-polevka-miska.jpg', alt = 'Dýňová polévka', sort_order = 0
   WHERE url = '/eshop/dynova-polevka.jpg' AND product_id = (SELECT id FROM products WHERE slug = 'dynova-polevka');
  GET DIAGNOSTICS n = ROW_COUNT; changed := changed + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/polevky/dynova-polevka-sacek.jpg', 'Dýňová polévka v balení s kohoutkem', 1 FROM products WHERE slug = 'dynova-polevka';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;
  UPDATE product_images SET url = '/eshop/polevky/kulajda-miska.jpg', alt = 'Kulajda', sort_order = 0
   WHERE url = '/eshop/kulajda.jpg' AND product_id = (SELECT id FROM products WHERE slug = 'kulajda');
  GET DIAGNOSTICS n = ROW_COUNT; changed := changed + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/polevky/kulajda-sacek.jpg', 'Kulajda v balení s kohoutkem', 1 FROM products WHERE slug = 'kulajda';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;
  UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-miska.jpg', alt = 'Tomatová polévka', sort_order = 0
   WHERE url = '/eshop/rajcatova-polevka.jpg' AND product_id = (SELECT id FROM products WHERE slug = 'rajcatova-polevka');
  GET DIAGNOSTICS n = ROW_COUNT; changed := changed + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/polevky/rajcatova-polevka-sacek.jpg', 'Tomatová polévka v balení s kohoutkem', 1 FROM products WHERE slug = 'rajcatova-polevka';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;
  UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska.jpg', alt = 'Rajčatová polévka s červenou řepou', sort_order = 0
   WHERE url = '/eshop/rajcatova-polevka-s-cervenou-repou.jpg' AND product_id = (SELECT id FROM products WHERE slug = 'rajcatova-polevka-s-cervenou-repou');
  GET DIAGNOSTICS n = ROW_COUNT; changed := changed + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-sacek.jpg', 'Rajčatová polévka s červenou řepou v balení s kohoutkem', 1 FROM products WHERE slug = 'rajcatova-polevka-s-cervenou-repou';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;
  UPDATE product_images SET url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-miska.jpg', alt = 'Gulášová polévka z hlívy ústřičné', sort_order = 0
   WHERE url = '/eshop/gulasova-polevka-z-hlivy-ustricne.jpg' AND product_id = (SELECT id FROM products WHERE slug = 'gulasova-polevka-z-hlivy-ustricne');
  GET DIAGNOSTICS n = ROW_COUNT; changed := changed + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-sacek.jpg', 'Gulášová polévka z hlívy ústřičné v balení s kohoutkem', 1 FROM products WHERE slug = 'gulasova-polevka-z-hlivy-ustricne';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;
  UPDATE product_images SET url = '/eshop/polevky/spenatova-polevka-miska.jpg', alt = 'Špenátová polévka', sort_order = 0
   WHERE url = '/eshop/spenatova-polevka.jpg' AND product_id = (SELECT id FROM products WHERE slug = 'spenatova-polevka');
  GET DIAGNOSTICS n = ROW_COUNT; changed := changed + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/polevky/spenatova-polevka-sacek.jpg', 'Špenátová polévka v balení s kohoutkem', 1 FROM products WHERE slug = 'spenatova-polevka';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;

  IF changed <> 6 THEN RAISE EXCEPTION 'Čekal jsem 6 původních hlavních fotek polévek, našel jsem % — zastavuji, nic se nezměnilo.', changed; END IF;
  IF added <> 6 THEN RAISE EXCEPTION 'Čekal jsem 6 nových fotek sáčku, přidal bych % — zastavuji, nic se nezměnilo.', added; END IF;

  UPDATE product_categories SET image_url = '/eshop/polevky/dynova-polevka-miska.jpg', updated_at = now()
   WHERE slug = 'polevky' AND image_url = '/eshop/kategorie-polevky.jpg';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Fotka kategorie Polévky není ta původní — zastavuji, nic se nezměnilo.'; END IF;

  IF (SELECT count(*) FROM product_images pi JOIN products p ON p.id = pi.product_id JOIN product_categories c ON c.id = p.category_id
       WHERE c.slug = 'polevky') <> 12 THEN
    RAISE EXCEPTION 'Polévky by neměly přesně 12 fotek — zastavuji, nic se nezměnilo.';
  END IF;
  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(p.slug || '|' || pi.url || '|' || pi.sort_order, '#' ORDER BY p.slug, pi.url))
    FROM product_images pi JOIN products p ON p.id = pi.product_id JOIN product_categories c ON c.id = p.category_id WHERE c.slug <> 'polevky') THEN
    RAISE EXCEPTION 'Změnily by se fotky jiné kategorie — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: 6 polévek má novou hlavní fotku a fotku sáčku, kategorie novou fotku.';
END $$;

COMMIT;
