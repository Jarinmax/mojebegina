BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/polevky/spenatova-polevka-miska-v5.jpg' WHERE url = '/eshop/polevky/spenatova-polevka-miska-v3.jpg';
UPDATE product_images SET url = '/eshop/polevky/spenatova-polevka-begina-v5.jpg' WHERE url = '/eshop/polevky/spenatova-polevka-begina-v3.jpg';
COMMIT;
