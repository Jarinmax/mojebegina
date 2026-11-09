-- Kokosové mléko — oprava podsložek (majitel 9. 11. 2026):
--   „kokosové mléko X % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435)“
-- místo „(kokosový extrakt 70 %, voda, emulgátor E435)“, resp. u špenátové
-- polévky „(70 % kokosový extrakt, voda, emulgátor E435)“.
--
-- Mění se JEN obsah závorky za kokosovým mlékem. Podíl kokosového mléka
-- v produktu a ostatní složení beze změny. Historické objednávky složení
-- neukládají (order_items drží jen název a SKU) — nic se nepřepisuje.
--
-- 5 produktů: dýňová polévka, kulajda, rajčatová polévka, rajčatová polévka
-- s červenou řepou, špenátová polévka.
--
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production). Jedna
-- transakce: když pojistka nesedí, NEZMĚNÍ SE NIC.
BEGIN;

DO $$
DECLARE
  n int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE "products"
     SET "ingredients" = replace(replace("ingredients",
           '(kokosový extrakt 70 %, voda, emulgátor E435)', '(kokosový extrakt 85 %, pitná voda, emulgátor: E 435)'),
           '(70 % kokosový extrakt, voda, emulgátor E435)', '(kokosový extrakt 85 %, pitná voda, emulgátor: E 435)'),
         "updated_at" = now()
   WHERE "ingredients" LIKE '%(kokosový extrakt 70 \%, voda, emulgátor E435)%'
      OR "ingredients" LIKE '%(70 \% kokosový extrakt, voda, emulgátor E435)%';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 5 THEN
    RAISE EXCEPTION 'Čekal jsem 5 produktů s kokosovým mlékem, změnil bych % — zastavuji, nic se nezměnilo.', n;
  END IF;

  IF EXISTS (SELECT 1 FROM "products" WHERE "ingredients" ILIKE '%kokosov%' AND "ingredients" NOT LIKE '%kokosové mléko % (kokosový extrakt 85 \%, pitná voda, emulgátor: E 435)%') THEN
    RAISE EXCEPTION 'Některé kokosové mléko nemá nové podsložky — zastavuji, nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM "products" WHERE "ingredients" ~ 'extrakt 70|E435') THEN
    RAISE EXCEPTION 'Zůstal původní zápis — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: % produktů má kokosové mléko (kokosový extrakt 85 %%, pitná voda, emulgátor: E 435).', n;
END $$;

COMMIT;

-- Kontrola po (spustit zvlášť; čekáno 0):
-- SELECT count(*) FROM products WHERE ingredients ~ 'extrakt 70|E435';
