-- 150: Ochutnávka polévek 3 × 450 ml – po otevření spotřebujte do 5 dnů (Lucie 24. 11. 2026).
-- Spouštět v Neon → SQL Editor → větev main → Run.
DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

UPDATE products
SET shelf_life_note = 'Spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 5 dnů.',
    updated_at = now()
WHERE slug = 'ochutnavka-polevek-3x450'
RETURNING name, shelf_life_note;
