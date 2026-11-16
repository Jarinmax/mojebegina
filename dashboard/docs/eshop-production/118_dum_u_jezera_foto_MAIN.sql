-- 118: Dům u jezera – nová hlavní fotka bez květů pelargonie (geránie).
-- Důvod: na fotce nesmí být suroviny, které ve složení nejsou (čl. 7 nař. 1169/2011).
BEGIN;
DO $$
DECLARE n int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
  UPDATE product_images
     SET url = '/eshop/ovocne-napoje/dum-u-jezera-hlavni-v3.jpg',
         alt = 'Dům u jezera – sklenice s ledem, grapefruit, zelené jablko a citron'
   WHERE url = '/eshop/ovocne-napoje/dum-u-jezera-hlavni-v2.jpg';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Čekal jsem 1 fotku, je %', n; END IF;
  RAISE NOTICE 'Hotovo: Dům u jezera má novou hlavní fotku.';
END $$;
COMMIT;
