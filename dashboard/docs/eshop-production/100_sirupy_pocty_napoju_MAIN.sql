-- Sirupy (11. 11. 2026): počty nápojů u každého balení zvlášť, aby cena
-- 199 Kč (650 ml) nestála vedle „až 150 nápojů“ (platí jen pro 3 l).
-- U všech 7 sirupů:
--   1) krátký popis na kartě: „3 l: až 150 nápojů (cca X Kč za nápoj).
--      650 ml: až 32 nápojů. Při ředění 1 : 10.“ (X = 3,70 / 3,30 jako dosud),
--   2) výhoda „až 150 nápojů z jednoho balení“ → „až 150 nápojů z balení 3 l“,
--   3) Zlaté pravidlo: „20 ml sirupu na 200 ml vody“ → „20 ml sirupu
--      a doplňte vodou na 200 ml nápoje“ (počty i cena za nápoj = 200 ml).
-- Ceny, balení, složení, výživa ani ostatní produkty se NEMĚNÍ.
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main, jen jednou.
BEGIN;

DO $$
DECLARE
  n int;
  rest_before text;
  old_rule constant text := 'Použijte přibližně **20 ml sirupu na 200 ml vody**. Chuť si můžete upravit podle sebe.';
  new_rule constant text := 'Použijte přibližně **20 ml sirupu a doplňte vodou na 200 ml nápoje**. Chuť si můžete upravit podle sebe.';
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  SELECT md5(string_agg(concat_ws('|', p.slug, p.name, p.ingredients, p.allergens::text, p.nutrition::text,
           p.storage_instructions, p.shelf_life_note, p.is_active::text,
           CASE WHEN c.slug = 'sirupy' THEN '' ELSE concat_ws('|', p.short_description, p.description::text, p.highlights::text) END),
           '#' ORDER BY p.slug))
    INTO rest_before FROM products p JOIN product_categories c ON c.id = p.category_id;

  UPDATE products p
     SET short_description = '3 l: až 150 nápojů (cca '
           || substring(p.short_description FROM 'přibližně na ([0-9],[0-9]{2}) Kč')
           || ' Kč za nápoj). 650 ml: až 32 nápojů. Při ředění 1 : 10.',
         highlights = array_replace(p.highlights, 'až 150 nápojů z jednoho balení', 'až 150 nápojů z balení 3 l'),
         description = array_replace(p.description, old_rule, new_rule),
         updated_at = now()
    FROM product_categories c
   WHERE c.id = p.category_id AND c.slug = 'sirupy'
     AND p.short_description ~ '^Až 150 nápojů z jednoho balení .*přibližně na [0-9],[0-9]{2} Kč\.$'
     AND 'až 150 nápojů z jednoho balení' = ANY (p.highlights)
     AND old_rule = ANY (p.description);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 7 THEN
    RAISE EXCEPTION 'Čekal jsem 7 sirupů s původními texty, změnil bych % — zastavuji, nic se nezměnilo.', n;
  END IF;

  IF EXISTS (SELECT 1 FROM products WHERE short_description ILIKE '%z jednoho balení%' OR highlights::text ILIKE '%z jednoho balení%'
             OR description::text LIKE '%20 ml sirupu na 200 ml vody%') THEN
    RAISE EXCEPTION 'Původní text zůstal jinde — zastavuji, nic se nezměnilo.';
  END IF;
  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(concat_ws('|', p.slug, p.name, p.ingredients, p.allergens::text, p.nutrition::text,
           p.storage_instructions, p.shelf_life_note, p.is_active::text,
           CASE WHEN c.slug = 'sirupy' THEN '' ELSE concat_ws('|', p.short_description, p.description::text, p.highlights::text) END),
           '#' ORDER BY p.slug)) FROM products p JOIN product_categories c ON c.id = p.category_id) THEN
    RAISE EXCEPTION 'Změnilo by se něco jiného — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: 7 sirupů — počty nápojů podle balení, výhoda „z balení 3 l“, Zlaté pravidlo na 200 ml nápoje.';
END $$;

COMMIT;
