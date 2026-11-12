-- 102: Nové fotky ovocných nápojů (hlavní + s beginou) a oprava popisků sirupů (sáček místo doypack).
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE slug IN ('dum-u-jezera','cervankove-nebe','malinovy-svarak-nealko'));
INSERT INTO product_images (product_id, url, alt, sort_order)
SELECT p.id, v.url, v.alt, v.ord FROM products p JOIN (VALUES
  ('dum-u-jezera','/eshop/ovocne-napoje/dum-u-jezera-hlavni.jpg','Dům u jezera – sklenice s ledem, grep, jablko a citron',0),
  ('dum-u-jezera','/eshop/ovocne-napoje/dum-u-jezera-begina.jpg','Dům u jezera v třílitrové begině s kohoutkem',1),
  ('cervankove-nebe','/eshop/ovocne-napoje/cervankove-nebe-hlavni.jpg','Červánkové nebe – sklenice s ledem, maliny, jablko a citron',0),
  ('cervankove-nebe','/eshop/ovocne-napoje/cervankove-nebe-begina.jpg','Červánkové nebe v třílitrové begině s kohoutkem',1),
  ('malinovy-svarak-nealko','/eshop/ovocne-napoje/malinovy-svarak-nealko-hlavni.jpg','Malinový svařák nealko – horký nápoj ve skleněném a keramickém hrnku',0),
  ('malinovy-svarak-nealko','/eshop/ovocne-napoje/malinovy-svarak-nealko-begina.jpg','Malinový svařák nealko v třílitrové begině s kohoutkem',1)
) AS v(slug,url,alt,ord) ON v.slug = p.slug;
UPDATE product_images SET alt = replace(alt, 've stříbrném doypacku', 've stříbrném sáčku 650 ml') WHERE alt LIKE '%doypack%';
SELECT p.slug, i.sort_order, i.url, i.alt FROM product_images i JOIN products p ON p.id=i.product_id
WHERE p.slug IN ('dum-u-jezera','cervankove-nebe','malinovy-svarak-nealko') OR i.alt LIKE '%sáčku 650%' ORDER BY 1,2;
COMMIT;
