-- 169: popisky fotek Šamana „Bylinný“ → „Bylinkový“ (Lucie 27. 11. 2026)
DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
  UPDATE product_images SET alt = replace(replace(alt, 'Bylinný sirup Šaman', 'Bylinkový sirup Šaman'), 'Bylinný čaj Šaman', 'Bylinkový čaj Šaman')
  WHERE alt LIKE 'Bylinný sirup Šaman%' OR alt LIKE 'Bylinný čaj Šaman%';
END $$;

SELECT p.slug, pi.alt FROM product_images pi JOIN products p ON p.id = pi.product_id
WHERE p.slug IN ('bylinny-sirup-saman','bylinny-caj-saman') ORDER BY 1, 2;
