-- Návrat k hodnotám před 11. 11. 2026
BEGIN;
UPDATE products SET
  ingredients = replace(replace(ingredients, 'výluh 40 %', 'výluh 40 %'), 'šťáva 10 %', 'šťáva 10 %'),
  highlights = array_replace(highlights, '40 % bylinného výluhu', '40 % bylinného výluhu'),
  description = array_replace(description, 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.', 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.'),
  nutrition = '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb
WHERE slug = 'bylinny-sirup-saman';
UPDATE products SET
  ingredients = replace(replace(ingredients, 'výluh 39 %', 'výluh 39 %'), 'šťáva 13 %', 'šťáva 12 %'),
  highlights = array_replace(highlights, '39 % bylinného výluhu', '39 % bylinného výluhu'),
  description = array_replace(description, 'Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.', 'Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.'),
  nutrition = '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb
WHERE slug = 'zazvorovy-sirup';
UPDATE products SET
  ingredients = replace(replace(ingredients, 'výluh 39 %', 'výluh 39 %'), 'šťáva 11 %', 'šťáva 12 %'),
  highlights = array_replace(highlights, '39 % bylinného výluhu', '39 % bylinného výluhu'),
  description = array_replace(description, 'Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.', 'Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.'),
  nutrition = '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb
WHERE slug = 'lipovy-sirup';
UPDATE products SET
  ingredients = replace(replace(ingredients, 'výluh 41 %', 'výluh 41 %'), 'šťáva 8 %', 'šťáva 8 %'),
  highlights = array_replace(highlights, '41 % bylinného výluhu', '41 % bylinného výluhu'),
  description = array_replace(description, 'Připravujeme jej z mimořádně silného bylinného výluhu (41 %), kvalitního třtinového cukru a čisté filtrované vody.', 'Připravujeme jej z mimořádně silného bylinného výluhu (41 %), kvalitního třtinového cukru a čisté filtrované vody.'),
  nutrition = '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb
WHERE slug = 'ibiskovy-sirup';
UPDATE products SET
  ingredients = replace(replace(ingredients, 'výluh 40 %', 'výluh 40 %'), 'šťáva 9 %', 'šťáva 9 %'),
  highlights = array_replace(highlights, '40 % bylinného výluhu', '40 % bylinného výluhu'),
  description = array_replace(description, 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.', 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.'),
  nutrition = '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb
WHERE slug = 'sipkovy-sirup';
UPDATE products SET
  ingredients = replace(replace(ingredients, 'výluh 40 %', 'výluh 36 %'), 'šťáva 10 %', 'šťáva 16 %'),
  highlights = array_replace(highlights, '40 % bylinného výluhu', '36 % bylinného výluhu'),
  description = array_replace(description, 'Připravujeme jej z mimořádně silného bylinného výluhu (40 %), kvalitního třtinového cukru a čisté filtrované vody.', 'Připravujeme jej z mimořádně silného bylinného výluhu (36 %), kvalitního třtinového cukru a čisté filtrované vody.'),
  nutrition = '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb
WHERE slug = 'hermankovy-sirup';
UPDATE products SET
  ingredients = replace(replace(ingredients, 'výluh 39 %', 'výluh 36 %'), 'šťáva 13 %', 'šťáva 16 %'),
  highlights = array_replace(highlights, '39 % bylinného výluhu', '36 % bylinného výluhu'),
  description = array_replace(description, 'Připravujeme jej z mimořádně silného bylinného výluhu (39 %), kvalitního třtinového cukru a čisté filtrované vody.', 'Připravujeme jej z mimořádně silného bylinného výluhu (36 %), kvalitního třtinového cukru a čisté filtrované vody.'),
  nutrition = '{"energy_kj":1105,"energy_kcal":260,"fat":0,"saturates":0,"carbohydrate":65,"sugars":64,"protein":0,"salt":0}'::jsonb
WHERE slug = 'medunkovy-sirup-s-levanduli';
COMMIT;
