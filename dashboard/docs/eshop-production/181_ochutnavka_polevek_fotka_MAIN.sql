-- 181: Ochutnávka polévek 3 × 450 ml – nová fotka (stříbrné sáčky se skutečnými etiketami, misky shora)
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/polevky/ochutnavka-polevek-3x450-v2.jpg' WHERE url = '/eshop/polevky/ochutnavka-polevek-3x450.jpg';
COMMIT;
