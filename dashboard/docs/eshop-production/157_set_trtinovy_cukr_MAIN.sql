DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

UPDATE products
SET highlights = array_prepend('slazené jen třtinovým cukrem', highlights),
    updated_at = now()
WHERE slug = 'ochutnavkovy-set-sirupu'
  AND NOT ('slazené jen třtinovým cukrem' = ANY (highlights))
RETURNING highlights;
