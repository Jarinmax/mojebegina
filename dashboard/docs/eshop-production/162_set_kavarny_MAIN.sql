DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

UPDATE products
SET short_description = 'Nevíte, který sirup si vybrat? Vyberte pět chutí a najděte svůj oblíbený. Naše sirupy nalévají kavárny i bistra v centru Prahy, vaříme je ve vlastní kuchyni od roku 2023.',
    updated_at = now()
WHERE slug = 'ochutnavkovy-set-sirupu'
  AND short_description = 'Nevíte, který sirup si vybrat? Vyberte pět chutí a najděte svůj oblíbený. Vaříme je ve vlastní kuchyni od roku 2023.'
RETURNING short_description;
