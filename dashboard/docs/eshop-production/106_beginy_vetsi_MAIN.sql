-- 106: Koktejly – fotky s větší beginou; Dům u jezera – nová fotka s beginou.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images i SET url = '/eshop/koktejly/' || p.slug || '-begina-v3.jpg'
FROM products p WHERE p.id = i.product_id AND i.url LIKE '/eshop/koktejly/%-begina%';
UPDATE product_images SET url = '/eshop/ovocne-napoje/dum-u-jezera-begina-v2.jpg' WHERE url = '/eshop/ovocne-napoje/dum-u-jezera-begina.jpg';
COMMIT;
