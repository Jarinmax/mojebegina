-- Polévky — Informace o potravině (majitel, 9. 11. 2026), všech 6 polévek:
--   Skladování:  „Skladujte v chladničce při teplotě do 4 °C, a to před
--                 otevřením i po otevření.“
--   Trvanlivost: „Neotevřené balení spotřebujte do data uvedeného na obalu.
--                 Po otevření spotřebujte do 14 dnů při skladování do 4 °C,
--                 nejpozději však do data ‚Spotřebujte do‘ uvedeného na obalu.“
-- Původní „Po otevření spotřebujte co nejdříve“, „Určeno k přímé spotřebě“,
-- „Do 14 dnů při zachování správného uskladnění“ i právní věta ze
-- Skladování zmizí — právní upozornění je nově samostatný řádek „Vrácení
-- a reklamace“ s odkazem na obchodní podmínky a „Příprava“ (doplňuje
-- e-shop podle kategorie, lib/eshop/soupFoodInfo.ts). Ostatní kategorie
-- beze změny.
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

  UPDATE "products" p
     SET "storage_instructions" = 'Skladujte v chladničce při teplotě do 4 °C, a to před otevřením i po otevření.',
         "shelf_life_note" = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při skladování do 4 °C, nejpozději však do data ‚Spotřebujte do‘ uvedeného na obalu.',
         "updated_at" = now()
    FROM "product_categories" c
   WHERE c."id" = p."category_id" AND c."slug" = 'polevky';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN
    RAISE EXCEPTION 'Čekal jsem 6 polévek, změnil bych % — zastavuji, nic se nezměnilo.', n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "products" p JOIN "product_categories" c ON c."id" = p."category_id"
     WHERE c."slug" = 'polevky'
       AND concat_ws(' ', p."storage_instructions", p."shelf_life_note") ~* 'co nejdříve|zachování správného uskladnění|odstoupení|nelze jej vrátit|přímé spotřebě'
  ) THEN
    RAISE EXCEPTION 'U polévky zůstala původní formulace — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: % polévek má nové skladování a trvanlivost.', n;
END $$;

COMMIT;

-- Kontrola po (spustit zvlášť):
-- SELECT slug, storage_instructions, shelf_life_note FROM products p JOIN product_categories c ON c.id = p.category_id WHERE c.slug = 'polevky';
