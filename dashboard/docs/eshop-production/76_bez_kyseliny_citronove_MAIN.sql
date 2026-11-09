-- Nové receptury bez samostatně přidávané kyseliny citronové (BEG-03;
-- majitel 9. 11. 2026: platí od listopadu pro všech 19 produktů, starší
-- šarže na skladě nejsou).
--
-- Ze složení se odstraní JEN samostatná položka „regulátor kyselosti:
-- kyselina citronová“. Kyselina citronová jako součást nakoupené suroviny
-- (uvedená v závorce u té suroviny) by zůstala — v aktuálních datech žádná
-- taková není. Ostatní složení, alergeny a výživové údaje beze změny.
--
-- 19 produktů: 5 polévek (dýňová, kulajda, rajčatová, rajčatová s červenou
-- řepou, špenátová), 8 čajů, 3 koktejly (Granátový Bond, Kosmopolitan,
-- Lady Carneval), 3 ovocné nápoje (Červánkové nebe, Dům u jezera, Malinový
-- svařák nealko).
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
     SET "ingredients" = regexp_replace("ingredients", 'regulátor kyselosti: kyselina citronová[,;] ', ''), "updated_at" = now()
   WHERE "is_active" AND "ingredients" ~ 'regulátor kyselosti: kyselina citronová[,;] ';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 19 THEN
    RAISE EXCEPTION 'Čekal jsem 19 produktů, změnil bych % — zastavuji, nic se nezměnilo.', n;
  END IF;

  IF EXISTS (SELECT 1 FROM "products" WHERE "is_active" AND "ingredients" ILIKE '%regulátor kyselosti%') THEN
    RAISE EXCEPTION 'Zůstal „regulátor kyselosti“ — zastavuji, nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM "products" WHERE "is_active" AND ("ingredients" ~ ', ,|; ,|,\s*$|^\s*,' OR "ingredients" ILIKE '%kyselina citronová%' AND "ingredients" NOT ILIKE '%(%kyselina citronová%)%')) THEN
    RAISE EXCEPTION 'Složení po úpravě nesedí (osamocená čárka nebo samostatná kyselina citronová) — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: % produktů bez samostatné kyseliny citronové.', n;
END $$;

COMMIT;

-- Kontrola po (spustit zvlášť; čekáno 0):
-- SELECT count(*) FROM products WHERE is_active AND ingredients ILIKE '%kyselina citronová%';
