-- 122: Malinový svařák nealko – nová fotka s beginou (stejná begina jako ostatní ovocné nápoje).
BEGIN;
DO $$
DECLARE n int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
  UPDATE product_images SET url = '/eshop/ovocne-napoje/malinovy-svarak-nealko-begina-v3.jpg'
   WHERE url = '/eshop/ovocne-napoje/malinovy-svarak-nealko-begina-v2.jpg';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Čekal jsem 1 fotku, je %', n; END IF;
  RAISE NOTICE 'Hotovo: Malinový svařák má novou fotku s beginou.';
END $$;
COMMIT;
