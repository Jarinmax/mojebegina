-- 105: Koktejly – třetí fotka se sáčkem 500 ml; nový Granátový Bond; hustší gulášová; nový Dům u jezera.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
DELETE FROM product_images WHERE url LIKE '/eshop/koktejly/%-sacek.jpg';
INSERT INTO product_images (product_id, url, alt, sort_order)
SELECT p.id, '/eshop/koktejly/' || p.slug || '-sacek.jpg', p.name || ' v sáčku 500 ml se šroubovacím uzávěrem', 2
FROM products p WHERE p.slug IN ('lady-carneval','granatovy-bond','svarak-deluxe','kosmopolitan');
UPDATE product_images SET url = '/eshop/koktejly/granatovy-bond-hlavni-v2.jpg' WHERE url = '/eshop/koktejly/granatovy-bond-hlavni.jpg';
UPDATE product_images SET url = '/eshop/koktejly/granatovy-bond-begina-v2.jpg' WHERE url = '/eshop/koktejly/granatovy-bond-begina.jpg';
UPDATE product_images SET url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-hlavni.jpg' WHERE url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-miska.jpg';
UPDATE product_images SET url = '/eshop/ovocne-napoje/dum-u-jezera-hlavni-v2.jpg', alt = 'Dům u jezera – sklenice s ledem, grep, jablko a květy pelargonie' WHERE url = '/eshop/ovocne-napoje/dum-u-jezera-hlavni.jpg';
COMMIT;
