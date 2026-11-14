-- 107: Červánkové nebe – nová hlavní fotka a fotka s beginou.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/ovocne-napoje/cervankove-nebe-hlavni-v2.jpg', alt = 'Červánkové nebe – sklenice s ledem, maliny, mandarinka a citron' WHERE url = '/eshop/ovocne-napoje/cervankove-nebe-hlavni.jpg';
UPDATE product_images SET url = '/eshop/ovocne-napoje/cervankove-nebe-begina-v2.jpg' WHERE url = '/eshop/ovocne-napoje/cervankove-nebe-begina.jpg';
COMMIT;
