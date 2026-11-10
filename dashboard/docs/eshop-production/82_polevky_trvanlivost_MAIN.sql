-- Polévky (všech 6) — nové znění řádku Trvanlivost (10. 11. 2026):
--   „Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření
--    spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však
--    do data uvedeného na obalu.“
-- Skladování ani sirupy se nemění.
--
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production). Jedna
-- transakce: když pojistka nesedí, NEZMĚNÍ SE NIC.
BEGIN;

DO $$
DECLARE
  n int;
  storage_before text;
  others_before text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
  SELECT md5(string_agg(coalesce(storage_instructions, ''), '|' ORDER BY slug)) INTO storage_before FROM products;
  SELECT md5(string_agg(coalesce(shelf_life_note, ''), '|' ORDER BY p.slug)) INTO others_before
    FROM products p JOIN product_categories c ON c.id = p.category_id WHERE c.slug <> 'polevky';

  UPDATE products p
     SET shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.',
         updated_at = now()
    FROM product_categories c
   WHERE c.id = p.category_id AND c.slug = 'polevky'
     AND p.shelf_life_note IS DISTINCT FROM 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'Čekal jsem 6 polévek, změnil bych % — zastavuji, nic se nezměnilo.', n; END IF;

  IF storage_before IS DISTINCT FROM (SELECT md5(string_agg(coalesce(storage_instructions, ''), '|' ORDER BY slug)) FROM products)
     OR others_before IS DISTINCT FROM (SELECT md5(string_agg(coalesce(shelf_life_note, ''), '|' ORDER BY p.slug)) FROM products p JOIN product_categories c ON c.id = p.category_id WHERE c.slug <> 'polevky') THEN
    RAISE EXCEPTION 'Změnilo by se skladování nebo jiná kategorie — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: 6 polévek má nové znění trvanlivosti.';
END $$;

COMMIT;
