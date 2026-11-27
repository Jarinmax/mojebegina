-- 167 (27. 11. 2026, Lucie): všude „bylinkové“ místo „bylinné“.
-- Mění: názvy 2 produktů, název kategorie Sirupy, popisy a chuť (Šaman čaj, Meduňkové).
-- NEMĚNÍ: adresy stránek (slug), složení a „bylinný výluh“ (musí sedět s etiketou až do dotisku).
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production), jen jednou.
BEGIN;

DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
END $$;

UPDATE products SET name = 'Bylinkový čaj Šaman'   WHERE slug = 'bylinny-caj-saman'   AND name = 'Bylinný čaj Šaman';
UPDATE products SET name = 'Bylinkový sirup Šaman' WHERE slug = 'bylinny-sirup-saman' AND name = 'Bylinný sirup Šaman';

UPDATE product_categories SET name = 'Bylinkové sirupy' WHERE slug = 'sirupy' AND name = 'Bylinné sirupy';

UPDATE products
SET description = ARRAY(
      SELECT replace(replace(replace(x, 'Bylinný sirup', 'Bylinkový sirup'), 'Bylinný čaj', 'Bylinkový čaj'), 'bylinný čaj', 'bylinkový čaj')
      FROM unnest(description) WITH ORDINALITY AS t(x, i) ORDER BY i)
WHERE slug IN ('medunkovy-sirup-s-levanduli', 'bylinny-caj-saman', 'medunkovy-caj-s-levanduli');

UPDATE products
SET taste_description = replace(taste_description, 'Lehký a bylinný', 'Lehký a bylinkový')
WHERE slug IN ('medunkovy-sirup-s-levanduli', 'medunkovy-caj-s-levanduli') AND taste_description LIKE '%Lehký a bylinný%';

COMMIT;

-- Kontrola: má vrátit Bylinkový čaj Šaman, Bylinkový sirup Šaman, Bylinkové sirupy a 0 starých popisů.
SELECT (SELECT string_agg(name, ', ' ORDER BY name) FROM products WHERE slug IN ('bylinny-caj-saman','bylinny-sirup-saman')) AS produkty,
       (SELECT name FROM product_categories WHERE slug = 'sirupy') AS kategorie,
       (SELECT count(*) FROM products WHERE array_to_string(description, ' ') ~ 'Bylinný (sirup|čaj)|bylinný čaj') AS stare_popisy;
