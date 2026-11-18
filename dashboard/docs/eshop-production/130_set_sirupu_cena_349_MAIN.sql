-- 130 (původně 128, spuštěno 17. 11. 2026): Ochutnávkový set sirupů – běžná cena 349 Kč (rozhodnutí 17. 11. 2026).
-- Mění jen běžnou cenu setu z 249 na 349 Kč a poznámku u akčního balení.
-- Akční cena 189 Kč, hmotnost ani nic jiného se nemění. Set je na webu stále skrytý.
-- Dá se spustit opakovaně.
BEGIN;
DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
  UPDATE product_variants SET price_b2c_kc = 349 WHERE sku = 'set-sirupy-5x100';
  UPDATE product_variants SET short_note = 'Akční cena včetně dopravy Zásilkovnou' WHERE sku = 'set-sirupy-5x100-k';
  IF (SELECT count(*) FROM product_variants WHERE sku = 'set-sirupy-5x100' AND price_b2c_kc = 349) <> 1 THEN
    RAISE EXCEPTION 'Cena setu se nezměnila – balení set-sirupy-5x100 nenalezeno.';
  END IF;
END $$;
COMMIT;
SELECT sku, price_b2c_kc, short_note FROM product_variants WHERE sku LIKE 'set-sirupy-5x100%' ORDER BY sort_order;
