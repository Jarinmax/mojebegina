-- 148: Úvod kategorie Bylinné sirupy – bez věty o sáčcích 650 ml (Lucie 24. 11. 2026).
-- Spouštět v Neon → SQL Editor → větev main → Run.
DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

UPDATE product_categories
SET intro = ARRAY[
      intro[1],
      intro[2],
      'Vybrat si můžete třílitrovou beginu s kohoutkem (až 150 nápojů, nápoj už od 3,30 Kč).'
    ],
    updated_at = now()
WHERE slug = 'sirupy'
  AND intro[3] LIKE 'Vybrat si můžete třílitrovou beginu s kohoutkem%'
RETURNING intro[3];
