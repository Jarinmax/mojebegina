-- 120: Červánkové nebe – nová hlavní fotka (bez mandarinky a máty).
BEGIN;
DO $$
DECLARE n int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
  UPDATE product_images
     SET url = '/eshop/ovocne-napoje/cervankove-nebe-hlavni-v3.jpg',
         alt = 'Červánkové nebe – sklenice s ledem, maliny, jablko a citron'
   WHERE url = '/eshop/ovocne-napoje/cervankove-nebe-hlavni-v2.jpg';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Čekal jsem 1 fotku, je %', n; END IF;
  RAISE NOTICE 'Hotovo: Červánkové nebe má novou hlavní fotku.';
END $$;
COMMIT;
