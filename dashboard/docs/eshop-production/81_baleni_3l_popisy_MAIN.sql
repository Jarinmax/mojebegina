-- Balení na celém e-shopu (9. 11. 2026):
--   • označení „Begina 3 l“ → „3 l“ u všech třílitrových variant,
--   • popis balení u variant (package_description) podle lib/eshop/packaging.ts:
--       3 l (vše)        „3 l – praktické balení … potřebujete.“
--       3 l sirupy       + „Dodáváme v kartonové krabici.“
--       700 ml sirupy    „700 ml – lehké balení ve stříbrném sáčku …“
--       500 ml koktejly  „500 ml – lehké balení v průhledném sáčku …“
--   • do popisu všech 7 sirupů zpět „Zlaté pravidlo Beginy“ (znění 9. 11. 2026).
-- Beze změny: hmotnosti pro dopravu, ceny, SKU, objemy, historické objednávky.
--
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production). Jedna
-- transakce: když pojistka nesedí, NEZMĚNÍ SE NIC.
BEGIN;

DO $$
DECLARE
  n_label int; n_desc int; n_golden int;
  keep_before text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  SELECT string_agg(sku || ':' || coalesce(weight_g::text, '-') || ':' || price_b2c_kc || ':' || coalesce(volume_ml::text, '-'), ',' ORDER BY sku)
    INTO keep_before FROM product_variants;

  UPDATE product_variants SET label = '3 l', updated_at = now() WHERE label = 'Begina 3 l';
  GET DIAGNOSTICS n_label = ROW_COUNT;
  IF n_label = 0 THEN RAISE EXCEPTION 'Žádné „Begina 3 l“ k úpravě — skript už asi proběhl, nic se nezměnilo.'; END IF;

  UPDATE product_variants v
     SET package_description = CASE
           WHEN v.label = '3 l' AND c.slug = 'sirupy' THEN '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete. Dodáváme v kartonové krabici.'
           WHEN v.label = '3 l' THEN '3 l – praktické balení pro snadnou manipulaci a dávkování přímo z kohoutku. Odeberete jen tolik, kolik právě potřebujete.'
           WHEN v.label = '700 ml' AND c.slug = 'sirupy' THEN '700 ml – lehké balení ve stříbrném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.'
           WHEN v.label = '500 ml' AND c.slug = 'koktejly' THEN '500 ml – lehké balení v průhledném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.'
         END,
         updated_at = now()
    FROM products p JOIN product_categories c ON c.id = p.category_id
   WHERE v.product_id = p.id
     AND (v.label = '3 l' OR (v.label = '700 ml' AND c.slug = 'sirupy') OR (v.label = '500 ml' AND c.slug = 'koktejly'));
  GET DIAGNOSTICS n_desc = ROW_COUNT;

  UPDATE products p
     SET description = description || ARRAY[
           '**Zlaté pravidlo Beginy:** doporučený poměr ředění je **1 : 10**.',
           'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.'],
         updated_at = now()
    FROM product_categories c
   WHERE c.id = p.category_id AND c.slug = 'sirupy' AND array_to_string(p.description, ' ') NOT LIKE '%Zlaté pravidlo Beginy%';
  GET DIAGNOSTICS n_golden = ROW_COUNT;
  IF n_golden <> 7 THEN RAISE EXCEPTION 'Čekal jsem 7 sirupů pro Zlaté pravidlo, bylo by % — zastavuji, nic se nezměnilo.', n_golden; END IF;

  IF EXISTS (SELECT 1 FROM product_variants WHERE label ~ 'Begina|750' OR package_description ~ 'Begina 3 l|750|bag-in-box') THEN
    RAISE EXCEPTION 'Zůstalo staré označení balení — zastavuji, nic se nezměnilo.';
  END IF;
  IF keep_before IS DISTINCT FROM (SELECT string_agg(sku || ':' || coalesce(weight_g::text, '-') || ':' || price_b2c_kc || ':' || coalesce(volume_ml::text, '-'), ',' ORDER BY sku) FROM product_variants) THEN
    RAISE EXCEPTION 'Změnila by se hmotnost, cena, objem nebo SKU — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: % variant „3 l“, % popisů balení, Zlaté pravidlo u % sirupů.', n_label, n_desc, n_golden;
END $$;

COMMIT;

-- Kontrola po (spustit zvlášť):
-- SELECT label, count(*) FROM product_variants GROUP BY label ORDER BY 1;
