-- 104: Koktejly – druhá fotka s beginou; špenátová polévka – nové (hustší) fotky.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
DELETE FROM product_images WHERE url LIKE '/eshop/koktejly/%-begina.jpg';
INSERT INTO product_images (product_id, url, alt, sort_order)
SELECT p.id, '/eshop/koktejly/' || p.slug || '-begina.jpg', p.name || ' v třílitrové begině s kohoutkem', 1
FROM products p WHERE p.slug IN ('lady-carneval','granatovy-bond','svarak-deluxe','kosmopolitan');
UPDATE product_images SET url = '/eshop/polevky/spenatova-polevka-hlavni.jpg' WHERE url = '/eshop/polevky/spenatova-polevka-miska.jpg';
UPDATE product_images SET url = '/eshop/polevky/spenatova-polevka-begina.jpg' WHERE url = '/eshop/polevky/spenatova-polevka-sacek.jpg';
COMMIT;
