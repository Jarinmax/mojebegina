-- Bylinné sirupy — nové fotografie na bílém podkladu (10. 11. 2026):
--   1. sklenice a hrnek se surovinami = hlavní fotka (katalog, kategorie,
--      vyhledávání, související produkty, náhled při sdílení),
--   2. průhledný sáček s kohoutkem, 3. stříbrný doypack.
--   Meduňkový sirup s levandulí zatím jen 1 + 2 (fotka doypacku nedodána).
-- Původní fotky se jen přestanou zobrazovat — soubory public/eshop/<slug>.jpg
-- v kódu zůstávají. Texty, ceny, varianty ani nic jiného se NEMĚNÍ.
--
-- SPUSTIT až po nasazení kódu s fotkami, CELÝ v Neon SQL Editoru na větvi
-- main (Production). Jedna transakce: když pojistka nesedí, NEZMĚNÍ SE NIC.
--
-- Vrácení:
--   DELETE FROM product_images WHERE url LIKE '/eshop/sirupy/%-sacek.jpg' OR url LIKE '/eshop/sirupy/%-doypack.jpg';
--   UPDATE product_images SET url = replace(replace(url, '/eshop/sirupy/', '/eshop/'), '-hlavni.jpg', '.jpg') WHERE url LIKE '/eshop/sirupy/%-hlavni.jpg';
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
   WHERE c.slug <> 'sirupy';

  UPDATE product_images SET url = '/eshop/sirupy/bylinny-sirup-saman-hlavni.jpg', alt = 'Bylinný sirup Šaman – sklenice a hrnek se surovinami', sort_order = 0
   WHERE url = '/eshop/bylinny-sirup-saman.jpg' AND product_id = (SELECT id FROM products WHERE slug = 'bylinny-sirup-saman');
  GET DIAGNOSTICS n = ROW_COUNT; changed := changed + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/sirupy/bylinny-sirup-saman-sacek.jpg', 'Bylinný sirup Šaman v průhledném sáčku s kohoutkem', 1 FROM products WHERE slug = 'bylinny-sirup-saman';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/sirupy/bylinny-sirup-saman-doypack.jpg', 'Bylinný sirup Šaman ve stříbrném doypacku', 2 FROM products WHERE slug = 'bylinny-sirup-saman';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;

  UPDATE product_images SET url = '/eshop/sirupy/zazvorovy-sirup-hlavni.jpg', alt = 'Zázvorový sirup – sklenice a hrnek se surovinami', sort_order = 0
   WHERE url = '/eshop/zazvorovy-sirup.jpg' AND product_id = (SELECT id FROM products WHERE slug = 'zazvorovy-sirup');
  GET DIAGNOSTICS n = ROW_COUNT; changed := changed + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/sirupy/zazvorovy-sirup-sacek.jpg', 'Zázvorový sirup v průhledném sáčku s kohoutkem', 1 FROM products WHERE slug = 'zazvorovy-sirup';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/sirupy/zazvorovy-sirup-doypack.jpg', 'Zázvorový sirup ve stříbrném doypacku', 2 FROM products WHERE slug = 'zazvorovy-sirup';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;

  UPDATE product_images SET url = '/eshop/sirupy/lipovy-sirup-hlavni.jpg', alt = 'Lipový sirup – sklenice a hrnek se surovinami', sort_order = 0
   WHERE url = '/eshop/lipovy-sirup.jpg' AND product_id = (SELECT id FROM products WHERE slug = 'lipovy-sirup');
  GET DIAGNOSTICS n = ROW_COUNT; changed := changed + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/sirupy/lipovy-sirup-sacek.jpg', 'Lipový sirup v průhledném sáčku s kohoutkem', 1 FROM products WHERE slug = 'lipovy-sirup';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/sirupy/lipovy-sirup-doypack.jpg', 'Lipový sirup ve stříbrném doypacku', 2 FROM products WHERE slug = 'lipovy-sirup';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;

  UPDATE product_images SET url = '/eshop/sirupy/ibiskovy-sirup-hlavni.jpg', alt = 'Ibiškový sirup – sklenice a hrnek se surovinami', sort_order = 0
   WHERE url = '/eshop/ibiskovy-sirup.jpg' AND product_id = (SELECT id FROM products WHERE slug = 'ibiskovy-sirup');
  GET DIAGNOSTICS n = ROW_COUNT; changed := changed + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/sirupy/ibiskovy-sirup-sacek.jpg', 'Ibiškový sirup v průhledném sáčku s kohoutkem', 1 FROM products WHERE slug = 'ibiskovy-sirup';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/sirupy/ibiskovy-sirup-doypack.jpg', 'Ibiškový sirup ve stříbrném doypacku', 2 FROM products WHERE slug = 'ibiskovy-sirup';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;

  UPDATE product_images SET url = '/eshop/sirupy/sipkovy-sirup-hlavni.jpg', alt = 'Šípkový sirup – sklenice a hrnek se surovinami', sort_order = 0
   WHERE url = '/eshop/sipkovy-sirup.jpg' AND product_id = (SELECT id FROM products WHERE slug = 'sipkovy-sirup');
  GET DIAGNOSTICS n = ROW_COUNT; changed := changed + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/sirupy/sipkovy-sirup-sacek.jpg', 'Šípkový sirup v průhledném sáčku s kohoutkem', 1 FROM products WHERE slug = 'sipkovy-sirup';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/sirupy/sipkovy-sirup-doypack.jpg', 'Šípkový sirup ve stříbrném doypacku', 2 FROM products WHERE slug = 'sipkovy-sirup';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;

  UPDATE product_images SET url = '/eshop/sirupy/hermankovy-sirup-hlavni.jpg', alt = 'Heřmánkový sirup – sklenice a hrnek se surovinami', sort_order = 0
   WHERE url = '/eshop/hermankovy-sirup.jpg' AND product_id = (SELECT id FROM products WHERE slug = 'hermankovy-sirup');
  GET DIAGNOSTICS n = ROW_COUNT; changed := changed + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/sirupy/hermankovy-sirup-sacek.jpg', 'Heřmánkový sirup v průhledném sáčku s kohoutkem', 1 FROM products WHERE slug = 'hermankovy-sirup';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/sirupy/hermankovy-sirup-doypack.jpg', 'Heřmánkový sirup ve stříbrném doypacku', 2 FROM products WHERE slug = 'hermankovy-sirup';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;

  UPDATE product_images SET url = '/eshop/sirupy/medunkovy-sirup-s-levanduli-hlavni.jpg', alt = 'Meduňkový sirup s levandulí – sklenice a hrnek se surovinami', sort_order = 0
   WHERE url = '/eshop/medunkovy-sirup-s-levanduli.jpg' AND product_id = (SELECT id FROM products WHERE slug = 'medunkovy-sirup-s-levanduli');
  GET DIAGNOSTICS n = ROW_COUNT; changed := changed + n;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/sirupy/medunkovy-sirup-s-levanduli-sacek.jpg', 'Meduňkový sirup s levandulí v průhledném sáčku s kohoutkem', 1 FROM products WHERE slug = 'medunkovy-sirup-s-levanduli';
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;

  IF changed <> 7 THEN RAISE EXCEPTION 'Čekal jsem 7 původních hlavních fotek sirupů, našel jsem % — zastavuji, nic se nezměnilo.', changed; END IF;
  IF added <> 13 THEN RAISE EXCEPTION 'Čekal jsem 13 nových fotek (sáček, doypack), přidal bych % — zastavuji, nic se nezměnilo.', added; END IF;
  IF (SELECT count(*) FROM product_images pi JOIN products p ON p.id = pi.product_id JOIN product_categories c ON c.id = p.category_id
       WHERE c.slug = 'sirupy') <> 20 THEN
    RAISE EXCEPTION 'Sirupy by neměly přesně 20 fotek — zastavuji, nic se nezměnilo.';
  END IF;
  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(p.slug || '|' || pi.url || '|' || pi.sort_order, '#' ORDER BY p.slug, pi.url))
    FROM product_images pi JOIN products p ON p.id = pi.product_id JOIN product_categories c ON c.id = p.category_id WHERE c.slug <> 'sirupy') THEN
    RAISE EXCEPTION 'Změnily by se fotky jiné kategorie — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: 7 sirupů má nové fotky (Meduňkový zatím bez doypacku).';
END $$;

COMMIT;
