-- Oprava složení a výživových údajů sirupů podle výrobních receptur (várka 3 l,
-- tabulka „Begina-sirupy a drinky“, 11. 11. 2026). Mění jen složení, výživové
-- údaje, „% bylinného výluhu“ v přednostech a v popisu. Nic jiného.
-- Spustit v Neon SQL Editoru na produkční větvi (main). Vratné: 34_…_rollback.sql.
BEGIN;
UPDATE products SET
  ingredients = replace(replace(ingredients, 'výluh 40 %', 'výluh 40 %'), 'šťáva 10 %', 'šťáva 10 %'),
  highlights = array_replace(highlights, '40 % bylinného výluhu', '40 % bylinného výluhu'),
  description = array_replace(description, 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.', 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.'),
  nutrition = '{"energy_kj":1091,"energy_kcal":257,"fat":0,"saturates":0,"carbohydrate":64,"sugars":64,"protein":0,"salt":0}'::jsonb
WHERE slug = 'bylinny-sirup-saman';
UPDATE products SET
  ingredients = replace(replace(ingredients, 'výluh 39 %', 'výluh 39 %'), 'šťáva 12 %', 'šťáva 13 %'),
  highlights = array_replace(highlights, '39 % bylinného výluhu', '39 % bylinného výluhu'),
  description = array_replace(description, 'Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.', 'Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.'),
  nutrition = '{"energy_kj":1061,"energy_kcal":250,"fat":0,"saturates":0,"carbohydrate":62,"sugars":62,"protein":0,"salt":0}'::jsonb
WHERE slug = 'zazvorovy-sirup';
UPDATE products SET
  ingredients = replace(replace(ingredients, 'výluh 39 %', 'výluh 39 %'), 'šťáva 12 %', 'šťáva 11 %'),
  highlights = array_replace(highlights, '39 % bylinného výluhu', '39 % bylinného výluhu'),
  description = array_replace(description, 'Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.', 'Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.'),
  nutrition = '{"energy_kj":1076,"energy_kcal":253,"fat":0,"saturates":0,"carbohydrate":63,"sugars":63,"protein":0,"salt":0}'::jsonb
WHERE slug = 'lipovy-sirup';
UPDATE products SET
  ingredients = replace(replace(ingredients, 'výluh 41 %', 'výluh 41 %'), 'šťáva 8 %', 'šťáva 8 %'),
  highlights = array_replace(highlights, '41 % bylinného výluhu', '41 % bylinného výluhu'),
  description = array_replace(description, 'Připravujeme jej z mimořádně silného bylinného výluhu (41 %), kvalitního třtinového cukru a čisté filtrované vody.', 'Připravujeme jej z mimořádně silného bylinného výluhu (41 %), kvalitního třtinového cukru a čisté filtrované vody.'),
  nutrition = '{"energy_kj":1124,"energy_kcal":264,"fat":0,"saturates":0,"carbohydrate":66,"sugars":66,"protein":0,"salt":0}'::jsonb
WHERE slug = 'ibiskovy-sirup';
UPDATE products SET
  ingredients = replace(replace(ingredients, 'výluh 40 %', 'výluh 40 %'), 'šťáva 9 %', 'šťáva 9 %'),
  highlights = array_replace(highlights, '40 % bylinného výluhu', '40 % bylinného výluhu'),
  description = array_replace(description, 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.', 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.'),
  nutrition = '{"energy_kj":1107,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":65,"protein":0,"salt":0}'::jsonb
WHERE slug = 'sipkovy-sirup';
UPDATE products SET
  ingredients = replace(replace(ingredients, 'výluh 36 %', 'výluh 40 %'), 'šťáva 16 %', 'šťáva 10 %'),
  highlights = array_replace(highlights, '36 % bylinného výluhu', '40 % bylinného výluhu'),
  description = array_replace(description, 'Připravujeme jej z mimořádně silného bylinného výluhu (36 %), kvalitního třtinového cukru a čisté filtrované vody.', 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.'),
  nutrition = '{"energy_kj":1091,"energy_kcal":257,"fat":0,"saturates":0,"carbohydrate":64,"sugars":64,"protein":0,"salt":0}'::jsonb
WHERE slug = 'hermankovy-sirup';
UPDATE products SET
  ingredients = replace(replace(ingredients, 'výluh 36 %', 'výluh 39 %'), 'šťáva 16 %', 'šťáva 13 %'),
  highlights = array_replace(highlights, '36 % bylinného výluhu', '39 % bylinného výluhu'),
  description = array_replace(description, 'Připravujeme jej z mimořádně silného bylinného výluhu (36 %), kvalitního třtinového cukru a čisté filtrované vody.', 'Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.'),
  nutrition = '{"energy_kj":1061,"energy_kcal":250,"fat":0,"saturates":0,"carbohydrate":62,"sugars":62,"protein":0,"salt":0}'::jsonb
WHERE slug = 'medunkovy-sirup-s-levanduli';
-- Kontrola: SELECT slug, ingredients, nutrition, highlights[1] FROM products WHERE slug LIKE '%sirup%' ORDER BY sort_order;
COMMIT;
