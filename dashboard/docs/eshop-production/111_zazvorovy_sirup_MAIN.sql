-- 111: Zázvorový sirup – nové fotky (limonáda i horký nápoj ve skle; s beginou; se sáčkem 650 ml).
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/sirupy/zazvorovy-sirup-hlavni-v2.jpg' WHERE url = '/eshop/sirupy/zazvorovy-sirup-hlavni.jpg';
UPDATE product_images SET url = '/eshop/sirupy/zazvorovy-sirup-sacek-v2.jpg' WHERE url = '/eshop/sirupy/zazvorovy-sirup-sacek.jpg';
UPDATE product_images SET url = '/eshop/sirupy/zazvorovy-sirup-doypack-v2.jpg' WHERE url = '/eshop/sirupy/zazvorovy-sirup-doypack.jpg';
COMMIT;
