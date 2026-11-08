-- Označení balení jen množstvím (zadání Lucie, 8. 11. 2026).
--
--   „3 l Rodinná zásoba (bag-in-box)“ → „3 l“    (Production: 28 balení)
--   „500 ml Praktické balení“          → „500 ml“ (Production: 4 balení)
--   „750 g Praktické balení“           → „750 g“  (Production: 7 balení)
-- Třílitrová balení dodáváme v sáčcích — krabici neslibujeme, proto i text
-- kategorií „Díky bag-in-box balení lze … dávkovat“ → „Díky balení
-- s kohoutkem lze … dávkovat“ (Production: 5 kategorií).
--
-- Mění se JEN štítek balení a ta jedna věta. Ceny, SKU, množství, sklad
-- a vazby variant zůstávají. Uložené objednávky se nepřepisují — e-shop
-- jejich položky zobrazuje už zkráceně (lib/eshop/packageLabel.ts).
--
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production). Jedna
-- transakce: když kterákoli pojistka nesedí, NEZMĚNÍ SE NIC.
BEGIN;

DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
END $$;

DO $$
DECLARE
  labels int;
  sections int;
BEGIN
  UPDATE "product_variants"
  SET "label" = substring("label" FROM '^(\d+(?:[.,]\d+)?\s*(?:ml|l|kg|g))\M'), "updated_at" = now()
  WHERE "label" ~* '^\d+(?:[.,]\d+)?\s*(ml|l|kg|g)\M\s*(Rodinná zásoba|Praktické balení)';
  GET DIAGNOSTICS labels = ROW_COUNT;

  UPDATE "product_categories"
  SET "detail_sections" = replace("detail_sections"::text, 'Díky bag-in-box balení lze', 'Díky balení s kohoutkem lze')::jsonb, "updated_at" = now()
  WHERE "detail_sections"::text LIKE '%Díky bag-in-box balení lze%';
  GET DIAGNOSTICS sections = ROW_COUNT;

  IF labels = 0 AND sections = 0 THEN
    RAISE EXCEPTION 'Nic k úpravě (skript už běžel?) — zastavuji, nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM "product_variants" WHERE "label" ~* 'bag-in-box|rodinná zásoba|praktické balení') THEN
    RAISE EXCEPTION 'Zůstal štítek se starým označením — zastavuji, nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM "product_variants" WHERE "label" IS NOT NULL AND "label" !~ '^\d+(,\d+)?\s(ml|l|kg|g)$') THEN
    RAISE EXCEPTION 'Některý štítek není ve tvaru „3 l“ / „500 ml“ / „750 g“ — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: % štítků balení, % kategorií.', labels, sections;
END $$;

COMMIT;

-- Kontrola po (spustit zvlášť; Production: 3 l | 28, 500 ml | 4, 750 g | 7):
-- SELECT "label", count(*) FROM "product_variants" GROUP BY "label" ORDER BY 2 DESC;
