-- 108: Dýňová polévka – fotka s beginou se sytější oranžovou polévkou.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/polevky/dynova-polevka-begina-v2.jpg' WHERE url = '/eshop/polevky/dynova-polevka-sacek.jpg';
COMMIT;
