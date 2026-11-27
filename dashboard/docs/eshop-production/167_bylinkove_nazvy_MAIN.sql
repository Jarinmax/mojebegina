-- Názvy „bylinný/é“ → „bylinkový/é“ všude (Lucie, 27. 11. 2026).
-- Mění jen viditelné texty: názvy produktů, kategorie, popisy, složení,
-- popisky balení a fotek, název receptury. Adresy (slug, URL fotek) zůstávají,
-- aby nespadly odkazy z Googlu, příspěvků a reklam.
-- Staré objednávky a faktury se nemění (jsou to doklady).
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production).
BEGIN;

DO $$
DECLARE
  n int;
  re  text := '([Bb])ylinn(ý|é|á|ou|ě)';
  rep text := '\1ylinkov\2';
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE products SET
    name                 = regexp_replace(name, re, rep, 'g'),
    short_description    = regexp_replace(short_description, re, rep, 'g'),
    taste_description    = regexp_replace(taste_description, re, rep, 'g'),
    ingredients          = regexp_replace(ingredients, re, rep, 'g'),
    allergen_note        = regexp_replace(allergen_note, re, rep, 'g'),
    storage_instructions = regexp_replace(storage_instructions, re, rep, 'g'),
    shelf_life_note      = regexp_replace(shelf_life_note, re, rep, 'g'),
    updated_at = now()
  WHERE concat_ws(' ', name, short_description, taste_description, ingredients,
                  allergen_note, storage_instructions, shelf_life_note) ~ re;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 13 THEN RAISE EXCEPTION 'Produkty: čekal jsem 13, je %', n; END IF;

  UPDATE product_categories SET
    name = regexp_replace(name, re, rep, 'g'),
    detail_sections = CASE WHEN detail_sections IS NULL THEN NULL
                           ELSE regexp_replace(detail_sections::text, re, rep, 'g')::jsonb END
  WHERE concat_ws(' ', name, detail_sections::text) ~ re;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Kategorie: čekal jsem 1, je %', n; END IF;

  UPDATE product_variants SET
    label = regexp_replace(label, re, rep, 'g'),
    short_note = regexp_replace(short_note, re, rep, 'g'),
    package_description = regexp_replace(package_description, re, rep, 'g')
  WHERE concat_ws(' ', label, short_note, package_description) ~ re;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Balení: čekal jsem 1, je %', n; END IF;

  UPDATE product_images SET alt = regexp_replace(alt, re, rep, 'g') WHERE alt ~ re;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 5 THEN RAISE EXCEPTION 'Popisky fotek: čekal jsem 5, je %', n; END IF;

  UPDATE recipes SET
    name = regexp_replace(name, re, rep, 'g'),
    note = regexp_replace(note, re, rep, 'g')
  WHERE concat_ws(' ', name, note) ~ re;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Receptury: čekal jsem 1, je %', n; END IF;

  RAISE NOTICE 'Hotovo: všude je „bylinkový/é“.';
END $$;

COMMIT;
