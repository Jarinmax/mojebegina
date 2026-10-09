-- PRODUCTION main — nová kategorie „Zmrzliny“ (viditelná, zatím bez produktů), S POJISTKOU
-- (VYGENEROVÁNO scripts/eshop-production/build-sql.mjs z docs/eshop-catalog/61_zmrzliny.sql).
-- Jako první krok kontrola: větev main (neon.timeline_id 70a96b3677653646e65343cae8e27182), katalog po fázi A,
-- Zmrzliny ještě nejsou. Jinak „STOP“ a NIC se nezmění. Spouštět CELÉ najednou v Neon SQL Editoru.
-- Kontrola po: docs/eshop-catalog/62_zmrzliny_after.sql → 1 | Zmrzliny | 60 | ano | 0 | 6 | ano.
-- Vrácení: docs/eshop-catalog/69_zmrzliny_rollback.sql (skryje, nic nemaže).

BEGIN;

-- ===== POJISTKA: jen Production main, jen jednou =====
DO $guard$
DECLARE
  timeline text := current_setting('neon.timeline_id', true);
BEGIN
  IF timeline IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'STOP: tohle NENÍ Production větev main (neon.timeline_id = %). Nic se nezměnilo.', coalesce(timeline, 'neznámý');
  END IF;
  IF (SELECT count(*) FROM product_categories WHERE slug IN ('polevky', 'sirupy', 'caje', 'ovocne-napoje', 'koktejly')) <> 5 THEN
    RAISE EXCEPTION 'STOP: katalog není ve stavu po fázi A (chybí některá z 5 kategorií). Nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM product_categories WHERE slug = 'zmrzliny') THEN
    RAISE EXCEPTION 'STOP: kategorie Zmrzliny už existuje. Nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'OK: Production main — přidávám kategorii Zmrzliny (bez produktů).';
END
$guard$;

-- ===== docs/eshop-catalog/61_zmrzliny.sql =====
INSERT INTO "product_categories" ("slug", "name", "intro", "sort_order", "is_active")
VALUES ('zmrzliny', 'Zmrzliny', '{}'::text[], 60, true)
ON CONFLICT ("slug") DO NOTHING;

COMMIT;
