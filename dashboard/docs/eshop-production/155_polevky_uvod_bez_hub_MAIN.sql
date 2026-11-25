-- 155: Úvod Čerstvých polévek bez „hub“ (houby jsou jen v Kulajdě a Gulášové z hlívy) – Lucie 25. 11. 2026.
-- Spouštět v Neon → SQL Editor → větev main → Run.
DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

UPDATE product_categories
SET intro[1] = 'Polévky ze zeleniny, bylinek, koření a čisté filtrované vody, 100% rostlinné. Stačí ohřát.',
    updated_at = now()
WHERE slug = 'polevky'
  AND intro[1] LIKE 'Polévky ze zeleniny, hub,%'
RETURNING intro[1];
