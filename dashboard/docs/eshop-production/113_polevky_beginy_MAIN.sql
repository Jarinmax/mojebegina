-- 113: Polévky – fotky s beginou (matná polévka v pytli, miska s povrchem rozmixované zeleniny).
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/polevky/spenatova-polevka-begina-v3.jpg' WHERE url = '/eshop/polevky/spenatova-polevka-begina.jpg';
UPDATE product_images SET url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-begina-v3.jpg' WHERE url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-begina.jpg';
UPDATE product_images SET url = '/eshop/polevky/kulajda-begina-v3.jpg' WHERE url = '/eshop/polevky/kulajda-begina.jpg';
UPDATE product_images SET url = '/eshop/polevky/dynova-polevka-begina-v3.jpg' WHERE url = '/eshop/polevky/dynova-polevka-begina-v2.jpg';
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-begina-v3.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-sacek.jpg';
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-begina-v3.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-sacek.jpg';
COMMIT;
