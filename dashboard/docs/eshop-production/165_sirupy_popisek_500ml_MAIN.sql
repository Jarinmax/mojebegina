DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

UPDATE products
SET short_description = replace(short_description, '650 ml: až 32 nápojů', '500 ml: až 25 nápojů'),
    updated_at = now()
WHERE slug IN ('zazvorovy-sirup', 'lipovy-sirup', 'medunkovy-sirup-s-levanduli')
  AND short_description LIKE '%650 ml: až 32 nápojů%'
RETURNING slug, short_description;
