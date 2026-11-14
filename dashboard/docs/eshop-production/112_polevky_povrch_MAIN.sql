-- 112: Polévky – hlavní fotky s povrchem rozmixované zeleniny (podle skutečné polévky).
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/polevky/spenatova-polevka-miska-v3.jpg' WHERE url = '/eshop/polevky/spenatova-polevka-hlavni.jpg';
UPDATE product_images SET url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-miska-v3.jpg' WHERE url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-hlavni.jpg';
UPDATE product_images SET url = '/eshop/polevky/kulajda-miska-v3.jpg' WHERE url = '/eshop/polevky/kulajda-hlavni.jpg';
UPDATE product_images SET url = '/eshop/polevky/dynova-polevka-miska-v3.jpg' WHERE url = '/eshop/polevky/dynova-polevka-miska.jpg';
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-miska-v3.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-miska.jpg';
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska-v3.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska.jpg';
COMMIT;
