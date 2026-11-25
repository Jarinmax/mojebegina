-- 153: Odstavec „Vhodné také pro gastro provozy a kanceláře“ bez úvodní věty,
-- která se opakuje s novým popisem produktu (Lucie „ano“ 25. 11. 2026).
-- Spouštět v Neon → SQL Editor → větev main → Run.
DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

UPDATE product_categories
SET detail_sections = jsonb_set(detail_sections, '{0,paragraphs,1}',
      to_jsonb(CASE slug
        WHEN 'polevky' THEN 'Díky balení s kohoutkem lze polévku jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu.'
        WHEN 'sirupy'  THEN 'Díky balení s kohoutkem lze sirup jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu.'
      END)),
    updated_at = now()
WHERE slug IN ('polevky', 'sirupy')
  AND detail_sections->0->'paragraphs'->>1 LIKE 'Stačí%'
RETURNING slug, detail_sections->0->'paragraphs'->>1 AS nova_veta;
