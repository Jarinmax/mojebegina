-- Dýňová a Rajčatová polévka: fotky podle skutečných polévek (kavárna Adélka) – hlavní a s beginou.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/polevky/dynova-polevka-miska-v5.jpg' WHERE url = '/eshop/polevky/dynova-polevka-miska-v3.jpg';
UPDATE product_images SET url = '/eshop/polevky/dynova-polevka-begina-v5.jpg' WHERE url = '/eshop/polevky/dynova-polevka-begina-v3.jpg';
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-miska-v5.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-miska-v3.jpg';
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-begina-v5.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-begina-v3.jpg';
COMMIT;
