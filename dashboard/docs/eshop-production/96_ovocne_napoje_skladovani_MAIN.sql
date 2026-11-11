-- Ovocné nápoje: řádek „Skladování“ jen skladování (11. 11. 2026). Protřepání
-- je v řádku „Příprava“ a odstoupení/reklamace v řádku „Vrácení a reklamace“
-- (lib/eshop/categoryFoodInfo.ts), stejně jako u polévek a sirupů.
-- Mění jen 3 ovocné nápoje. SPUSTIT CELÝ v Neon SQL Editoru na větvi main.
BEGIN;

DO $$
DECLARE
  n int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
  UPDATE products SET storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.', updated_at = now()
   WHERE slug IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko')
     AND storage_instructions = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření. Před použitím protřepejte, usazenina z ovoce je přirozená. Výrobek podléhá rychlé zkáze, proto se na něj nevztahuje právo na odstoupení od smlouvy (čl. VII obchodních podmínek). Reklamace vadného zboží tím není dotčena – vadu zjištěnou při převzetí nám prosím ohlaste ihned, ideálně s fotografií.';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 3 THEN RAISE EXCEPTION 'Ovocné nápoje nemají očekávaný text skladování (%) — zastavuji, nic se nezměnilo.', n; END IF;
  RAISE NOTICE 'Hotovo: skladování ovocných nápojů upraveno.';
END $$;

COMMIT;
