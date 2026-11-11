-- Texty kategorií Čaje, Ovocné nápoje, Alkoholické koktejly (12. 11. 2026),
-- schválil majitel. Nic jiného se NEMĚNÍ. SPUSTIT CELÝ v Neon SQL Editoru
-- na větvi main (Production). Když pojistka nesedí, NEZMĚNÍ SE NIC.
BEGIN;

DO $$
DECLARE
  n int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
  IF (SELECT intro[1] FROM product_categories WHERE slug = 'caje') NOT LIKE 'Čaje Begina jsou hotové nápoje připravené%'
     OR (SELECT intro[1] FROM product_categories WHERE slug = 'ovocne-napoje') NOT LIKE 'Poctivé ovocné prémiové nápoje%'
     OR (SELECT intro[1] FROM product_categories WHERE slug = 'koktejly') NOT LIKE 'Alkoholické koktejly Begina spojují%' THEN
    RAISE EXCEPTION 'Některý text je jiný, než čekám — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE product_categories SET intro = ARRAY[
    'Čaje Begina jsou hotové nápoje uvařené z bylin a čajových lístků, oslazené třtinovým cukrem a dochucené citronem. Základem je čistá filtrovaná voda.',
    'Stačí natočit z beginy a pít ledové, nebo ohřát na horký čaj. Po otevření vydrží v lednici 14 dní – ideální na léto, na výlet i k vodě.'
  ] WHERE slug = 'caje';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'Čaje nenalezeny — zastavuji.'; END IF;

  UPDATE product_categories SET intro = ARRAY[
    'Ovocné nápoje Begina mícháme z ovocných šťáv, citronu a čisté filtrované vody. Bez přidaného cukru – obsahují jen přirozeně přítomné cukry z ovoce.',
    'Vyrábíme je čerstvé až na objednávku. Nejlepší jsou vychlazené s ledem, Malinový svařák si ohřejte. Po otevření spotřebujte do 5 dnů.'
  ] WHERE slug = 'ovocne-napoje';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'Ovocné nápoje nenalezeny — zastavuji.'; END IF;

  UPDATE product_categories SET intro = ARRAY[
    'Alkoholické koktejly Begina jsou hotové míchané nápoje z destilátů a ovocných šťáv. Stačí nalít na led, Svařák Deluxe ohřát.',
    'Prodáváme je v sáčku 500 ml a v třílitrové begině – na oslavu i zahradní párty. Po otevření vydrží v lednici 14 dní. Prodej jen osobám starším 18 let.'
  ] WHERE slug = 'koktejly';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'Koktejly nenalezeny — zastavuji.'; END IF;

  RAISE NOTICE 'Hotovo: texty Čajů, Ovocných nápojů a Koktejlů upraveny.';
END $$;

COMMIT;
