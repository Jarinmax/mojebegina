DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

UPDATE products p
SET highlights = array_append(p.highlights, 'vyrobeno v Česku, ve vlastní kuchyni'),
    updated_at = now()
FROM product_categories c
WHERE c.id = p.category_id
  AND c.slug <> 'ochutnavka-provoz'
  AND p.is_active
  AND NOT ('vyrobeno v Česku, ve vlastní kuchyni' = ANY (p.highlights))
RETURNING c.slug, p.name;
