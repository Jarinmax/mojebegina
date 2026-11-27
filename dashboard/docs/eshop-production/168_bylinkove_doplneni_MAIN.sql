-- 168 (27. 11. 2026, Lucie): doplnění k 167 — „bylinkové“ i v Receptech a v ochutnávce sirupů.
-- Mění: název receptu Bylinný čaj Šaman, popisek balení Šaman 100 ml v Ochutnávkovém setu.
-- NEMĚNÍ: adresy (slug), složení („bylinný výluh“ zůstává kvůli etiketám).
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production), jen jednou.
BEGIN;

DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
END $$;

UPDATE recipes SET name = 'Bylinkový čaj Šaman' WHERE slug = 'bylinny-caj-saman' AND name = 'Bylinný čaj Šaman';
UPDATE product_variants SET label = 'Bylinkový sirup Šaman 100 ml'
WHERE sku = 'ochutnavka-sirup-bylinny-sirup-saman' AND label = 'Bylinný sirup Šaman 100 ml';

COMMIT;

-- Kontrola: má vrátit Bylinkový čaj Šaman a Bylinkový sirup Šaman 100 ml.
SELECT (SELECT name FROM recipes WHERE slug = 'bylinny-caj-saman') AS recept,
       (SELECT label FROM product_variants WHERE sku = 'ochutnavka-sirup-bylinny-sirup-saman') AS ochutnavka;
