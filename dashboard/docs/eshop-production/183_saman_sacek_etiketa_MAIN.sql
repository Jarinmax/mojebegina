-- 183: Bylinkový sirup Šaman – fotka se stříbrným sáčkem: správný tvar sáčku + černobílá etiketa 500 ml
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/sirupy/bylinny-sirup-saman-doypack-v2.jpg' WHERE url = '/eshop/sirupy/bylinny-sirup-saman-doypack.jpg';
COMMIT;
