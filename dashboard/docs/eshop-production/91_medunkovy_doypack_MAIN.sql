-- Meduňkový sirup s levandulí — doplnění 3. fotky (stříbrný doypack), 10. 11. 2026.
-- SPUSTIT až po nasazení kódu, CELÝ v Neon SQL Editoru na větvi main.
-- Jen přidá 1 fotku; nic jiného se nemění. Vrácení:
--   DELETE FROM product_images WHERE url = '/eshop/sirupy/medunkovy-sirup-s-levanduli-doypack.jpg';
BEGIN;

DO $$
DECLARE
  n int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
  IF (SELECT count(*) FROM product_images pi JOIN products p ON p.id = pi.product_id WHERE p.slug = 'medunkovy-sirup-s-levanduli') <> 2 THEN
    RAISE EXCEPTION 'Meduňkový nemá přesně 2 fotky (skript 89 nebo už doplněno) — zastavuji, nic se nezměnilo.';
  END IF;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT id, '/eshop/sirupy/medunkovy-sirup-s-levanduli-doypack.jpg', 'Meduňkový sirup s levandulí ve stříbrném doypacku', 2
    FROM products WHERE slug = 'medunkovy-sirup-s-levanduli';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Fotku se nepodařilo přidat — zastavuji, nic se nezměnilo.'; END IF;
  RAISE NOTICE 'Hotovo: Meduňkový sirup má 3. fotku (doypack).';
END $$;

COMMIT;
