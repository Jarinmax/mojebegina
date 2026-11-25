DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

UPDATE product_categories
SET intro[1] = 'Polévky, které už přes rok objednávají kavárny v centru Prahy. Krémové, pořádně dochucené a 100% rostlinné. Stačí ohřát.',
    updated_at = now()
WHERE slug = 'polevky'
  AND intro[1] LIKE 'Polévky ze zeleniny, bylinek,%'
RETURNING intro[1];
