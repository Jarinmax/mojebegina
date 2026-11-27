BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-miska-v6.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-miska-v5.jpg';
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-begina-v6.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-begina-v5.jpg';
COMMIT;
