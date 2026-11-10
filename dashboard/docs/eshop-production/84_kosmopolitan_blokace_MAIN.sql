-- Kosmopolitan (10. 11. 2026): dočasná BLOKACE objednání, dokud dodavatel
-- brusinkové šťávy nepotvrdí, zda šťáva obsahuje oxid siřičitý / siřičitany
-- (> 10 mg/kg nebo 10 mg/l → povinný alergen, příloha II bod 12 nař.
-- 1169/2011). Úkol BEG-02.
--
-- Co se stane: allergens = NULL („neověřeno“). E-shop pak produkt ukáže jako
-- „Připravujeme“, nejde vložit do košíku ani objednat (kontrola je i na
-- serveru, lib/eshop/pricing.ts). Nic jiného se nemění, produkt zůstává
-- aktivní, historické objednávky beze změny.
--
-- Zrušení blokace po potvrzení dodavatele:
--   bez siřičitanů:  UPDATE products SET allergens = '{}'          WHERE slug = 'kosmopolitan';
--   se siřičitany:   UPDATE products SET allergens = '{sulphites}' WHERE slug = 'kosmopolitan';
--   (a u siřičitanů zvýraznit v Složení, např. „brusinková šťáva (obsahuje SIŘIČITANY)“)
--
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production).
BEGIN;

DO $$
DECLARE
  n int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE products
     SET allergens = NULL, updated_at = now()
   WHERE slug = 'kosmopolitan' AND allergens = '{}';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Kosmopolitan nemá prázdné alergeny (nebo neexistuje), změnil bych % — zastavuji, nic se nezměnilo.', n; END IF;

  IF (SELECT count(*) FROM products WHERE allergens IS NULL AND is_active) <> 1 THEN
    RAISE EXCEPTION 'Blokovaný by byl jiný počet produktů než 1 — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: Kosmopolitan dočasně nelze objednat (alergeny neověřeny).';
END $$;

COMMIT;
