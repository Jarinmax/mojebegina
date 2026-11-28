-- 184: šest sirupů – fotka se stříbrným sáčkem: správný tvar sáčku + černobílá etiketa 500 ml
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/sirupy/hermankovy-sirup-doypack-v2.jpg' WHERE url = '/eshop/sirupy/hermankovy-sirup-doypack.jpg';
UPDATE product_images SET url = '/eshop/sirupy/ibiskovy-sirup-doypack-v2.jpg' WHERE url = '/eshop/sirupy/ibiskovy-sirup-doypack.jpg';
UPDATE product_images SET url = '/eshop/sirupy/lipovy-sirup-doypack-v2.jpg' WHERE url = '/eshop/sirupy/lipovy-sirup-doypack.jpg';
UPDATE product_images SET url = '/eshop/sirupy/medunkovy-sirup-s-levanduli-doypack-v2.jpg' WHERE url = '/eshop/sirupy/medunkovy-sirup-s-levanduli-doypack.jpg';
UPDATE product_images SET url = '/eshop/sirupy/sipkovy-sirup-doypack-v2.jpg' WHERE url = '/eshop/sirupy/sipkovy-sirup-doypack.jpg';
UPDATE product_images SET url = '/eshop/sirupy/zazvorovy-sirup-doypack-v3.jpg' WHERE url = '/eshop/sirupy/zazvorovy-sirup-doypack.jpg';
COMMIT;
