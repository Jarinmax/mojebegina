BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-miska-v6.jpg' WHERE url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-miska-v3.jpg';
UPDATE product_images SET url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-begina-v6.jpg' WHERE url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-begina-v3.jpg';
COMMIT;
