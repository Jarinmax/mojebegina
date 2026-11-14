-- 110: Kulajda – nové (hustší) fotky, hlavní a s beginou.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/polevky/kulajda-hlavni.jpg' WHERE url = '/eshop/polevky/kulajda-miska.jpg';
UPDATE product_images SET url = '/eshop/polevky/kulajda-begina.jpg' WHERE url = '/eshop/polevky/kulajda-sacek.jpg';
COMMIT;
