-- 180: Rajčatová polévka s červenou řepou – miska shora (pažitka, pepř, černý sezam) + begina, skutečná barva
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska-v6.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska-v3.jpg';
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-begina-v6.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-begina-v3.jpg';
COMMIT;
