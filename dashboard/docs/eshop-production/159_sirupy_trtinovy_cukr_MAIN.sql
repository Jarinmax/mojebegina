DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

UPDATE products p
SET highlights = array_prepend('slazené jen třtinovým cukrem', p.highlights),
    updated_at = now()
FROM product_categories c
WHERE c.id = p.category_id
  AND c.slug = 'sirupy'
  AND p.is_active
  AND NOT ('slazené jen třtinovým cukrem' = ANY (p.highlights))
RETURNING p.name, p.highlights;
