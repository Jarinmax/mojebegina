-- 139: Polévky – nové hlavní fotky (dřevěný stůl, suroviny dané polévky, tip na servírování). Schváleno Lucií 20. 11. 2026.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/polevky/dynova-polevka-miska-v4.jpg' WHERE url = '/eshop/polevky/dynova-polevka-miska-v3.jpg';
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-miska-v4.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-miska-v3.jpg';
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska-v4.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-miska-v3.jpg';
UPDATE product_images SET url = '/eshop/polevky/spenatova-polevka-miska-v4.jpg' WHERE url = '/eshop/polevky/spenatova-polevka-miska-v3.jpg';
UPDATE product_images SET url = '/eshop/polevky/kulajda-miska-v4.jpg' WHERE url = '/eshop/polevky/kulajda-miska-v3.jpg';
UPDATE product_images SET url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-miska-v4.jpg' WHERE url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-miska-v3.jpg';
COMMIT;
