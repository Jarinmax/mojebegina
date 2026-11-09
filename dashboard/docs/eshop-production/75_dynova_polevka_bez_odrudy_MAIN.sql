-- Dýňová polévka: „dýně Hokkaido 39 %“ → „dýně 39 %“ (majitel, 9. 11. 2026).
-- Používáme směs dýní, konkrétní odrůdu neuvádíme. Podíl 39 % a celé
-- ostatní složení zůstávají beze změny; mění se jen slovo „Hokkaido“.
-- Audit 9. 11.: v Production je „Hokkaido“ jen ve složení dýňové polévky
-- (žádný jiný text produktu, varianta, kategorie ani položka objednávky).
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
     SET "ingredients" = replace("ingredients", 'dýně Hokkaido 39 %', 'dýně 39 %'), "updated_at" = now()
   WHERE "slug" = 'dynova-polevka' AND "ingredients" LIKE '%dýně Hokkaido 39 \%%';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Čekal jsem 1 produkt (dýňová polévka), změnil bych % — zastavuji, nic se nezměnilo.', n;
  END IF;

  -- nikde v textech produktů, variant ani kategorií už „Hokkaido“ nesmí zůstat
  IF EXISTS (
    SELECT 1 FROM "products"
     WHERE concat_ws(' ', "name", "short_description", "taste_description", "ingredients", "allergen_note",
                     "storage_instructions", "shelf_life_note", array_to_string("description", ' '),
                     array_to_string("highlights", ' '), array_to_string("warnings", ' '), "nutrition"::text) ILIKE '%hokkaid%'
  ) OR EXISTS (
    SELECT 1 FROM "product_variants" WHERE concat_ws(' ', "label", "package_description", "short_note") ILIKE '%hokkaid%'
  ) OR EXISTS (
    SELECT 1 FROM "product_categories" WHERE concat_ws(' ', "name", array_to_string("intro", ' '), "detail_sections"::text) ILIKE '%hokkaid%'
  ) THEN
    RAISE EXCEPTION 'Slovo „Hokkaido“ zůstalo jinde — zastavuji, nic se nezměnilo.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "products" WHERE "slug" = 'dynova-polevka' AND "ingredients" LIKE 'čistá filtrovaná voda, dýně 39 \%, kokosové mléko 15 \%%') THEN
    RAISE EXCEPTION 'Složení po úpravě nesedí — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: dýňová polévka má ve složení „dýně 39 %%“.';
END $$;

COMMIT;

-- Kontrola po (spustit zvlášť):
-- SELECT ingredients FROM products WHERE slug = 'dynova-polevka';
