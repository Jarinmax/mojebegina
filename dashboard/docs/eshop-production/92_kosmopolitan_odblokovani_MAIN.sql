-- Kosmopolitan (10. 11. 2026): ZRUŠENÍ BLOKACE ze skriptu 84 + oprava názvu aromatu.
--
-- Podklady (etikety dodané Jarinem 10. 11. 2026, evidence v ALERGENY_TVRZENI_POSOUZENI.md):
--   brusinková, jablečná a citronová šťáva — 100% NFC (Naturalne Tłoczone), alergeny neuvedeny;
--   třtinový cukr Demerara (Riopaila Castilla) — alergeny neuvedeny;
--   grepový esenciální olej Terpenic (Citrus paradisi, kůra, lisování za studena,
--   „legislativní zařazení: potravinářské aroma“, vnitřní užití).
--
-- Změny (jen Kosmopolitan):
--   1) allergens NULL → '{}'  (produkt jde znovu objednat),
--   2) složení: „přírodní aroma“ → „přírodní grapefruitové aroma“ — aroma je z jediného
--      zdroje (grapefruit); samotné „přírodní aroma“ jen pro aroma z více zdrojů
--      (čl. 16 odst. 4 a 6 nař. 1334/2008).
-- Ceny, receptura, alkohol, skladování, trvanlivost ani jiné produkty se NEMĚNÍ.
--
-- Vrácení (zpět na stav po skriptu 84):
--   UPDATE products SET allergens = NULL,
--     ingredients = replace(ingredients, 'přírodní grapefruitové aroma', 'přírodní aroma')
--   WHERE slug = 'kosmopolitan';
--
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production), jen jednou.
BEGIN;

DO $$
DECLARE
  n int;
  others_before text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  SELECT md5(string_agg(concat_ws('|', slug, name, ingredients, allergens::text, nutrition::text,
           storage_instructions, shelf_life_note, is_active::text), '#' ORDER BY slug))
    INTO others_before FROM products WHERE slug <> 'kosmopolitan';

  UPDATE products
     SET allergens = '{}',
         ingredients = 'čistá filtrovaná voda, brusinková šťáva, jablečná šťáva, vodka, citronová šťáva, třtinový cukr, antioxidant: kyselina askorbová (vitamin C), přírodní grapefruitové aroma',
         updated_at = now()
   WHERE slug = 'kosmopolitan'
     AND allergens IS NULL
     AND ingredients = 'čistá filtrovaná voda, brusinková šťáva, jablečná šťáva, vodka, citronová šťáva, třtinový cukr, antioxidant: kyselina askorbová (vitamin C), přírodní aroma';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Kosmopolitan není ve stavu po skriptu 84 (už odblokován nebo jiné složení) — zastavuji, nic se nezměnilo.';
  END IF;

  IF EXISTS (SELECT 1 FROM products WHERE allergens IS NULL AND is_active) THEN
    RAISE EXCEPTION 'Jiný aktivní produkt má neověřené alergeny — zastavuji, nic se nezměnilo.';
  END IF;
  IF others_before IS DISTINCT FROM (SELECT md5(string_agg(concat_ws('|', slug, name, ingredients, allergens::text, nutrition::text,
           storage_instructions, shelf_life_note, is_active::text), '#' ORDER BY slug)) FROM products WHERE slug <> 'kosmopolitan') THEN
    RAISE EXCEPTION 'Změnil by se jiný produkt — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: Kosmopolitan lze znovu objednat; aroma = přírodní grapefruitové aroma.';
END $$;

COMMIT;
