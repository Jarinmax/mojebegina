-- 182: Rajčatová polévka s červenou řepou – přirozeněji hozená pažitka (hlavní fotka + s beginou)
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska-v7.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska-v6.jpg';
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-begina-v7.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-begina-v6.jpg';
COMMIT;
