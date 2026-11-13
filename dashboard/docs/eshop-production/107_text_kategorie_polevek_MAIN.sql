-- 107: Úvodní text kategorie Čerstvé polévky — drobné úpravy, 14. 11. 2026.
-- Znění schválila Lucie 14. 11. 2026 v chatu: voda na konec výčtu, „krémových
-- polévek“ místo „krémů“, „až 14 dní“ (v souladu s trvanlivostí u produktů),
-- bez „u společného stolu“, malé „vás“.
-- Mění se JEN product_categories.intro u kategorie polevky. Sekce pro gastro
-- provozy, ostatní kategorie ani produkty se NEMĚNÍ.
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main, jen jednou.
BEGIN;

DO $$
DECLARE
  n int;
  rest_before text;
  rest_sql constant text := $q$
    SELECT md5(string_agg(concat_ws('|', slug, name, detail_sections::text, image_url, sort_order::text, is_active::text,
             CASE WHEN slug = 'polevky' THEN '' ELSE intro::text END), '#' ORDER BY slug))
      FROM product_categories $q$;
  rest_after text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  EXECUTE rest_sql INTO rest_before;

  UPDATE product_categories SET intro = ARRAY[
      'Čerstvé polévky Begina vaříme ze zeleniny, hub, bylinek, koření a čisté filtrované vody. Všechny jsou z rostlinných surovin, bez masa a mléčných výrobků. Každá má svou vlastní chuť, od jemných krémových polévek po výraznou gulášovou z hlívy ústřičné.',
      'Dobrou polévku si můžete dopřát i ve dnech, kdy na vaření nezbývá čas. Stačí ohřát a podávat, doma i v práci.',
      'Z třílitrové beginy s kohoutkem si natočíte právě tolik, kolik potřebujete. Zbytek uložíte do lednice, kde po otevření vydrží až 14 dní, a další porci máte po ruce. Polévky doručujeme chlazenou přepravou. Méně času u plotny, více času pro vás.'
    ]::text[], updated_at = now()
   WHERE slug = 'polevky';
  GET DIAGNOSTICS n = ROW_COUNT;

  IF n <> 1 THEN
    RAISE EXCEPTION 'Čekal jsem 1 kategorii polevky, našel jsem % — zastavuji, nic se nezměnilo.', n;
  END IF;

  EXECUTE rest_sql INTO rest_after;
  IF rest_before IS DISTINCT FROM rest_after THEN
    RAISE EXCEPTION 'Změnilo by se něco jiného než úvodní text polévek — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: nový úvodní text kategorie Čerstvé polévky. Ostatní beze změny.';
END $$;

SELECT slug, intro FROM product_categories WHERE slug = 'polevky';

COMMIT;
