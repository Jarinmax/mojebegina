-- ESHOP 1.0 — nová kategorie „Zmrzliny“ (rozhodnutí vedení 8. 10. 2026).
-- Viditelná hned (is_active), zatím BEZ produktů: stránka kategorie ukáže
-- „Připravujeme — nabídku brzy doplníme.“, v menu je jako „Zmrzliny“.
-- Bez úvodního textu a obrázku (texty se nevymýšlejí — dodá vedení
-- s produkty). Mražená přeprava se řeší až s produkty.
-- Spustit CELÝ soubor najednou; opakované spuštění nic nezmění.
-- Kontrola před: 60_zmrzliny_before.sql, po: 62_zmrzliny_after.sql.
-- Vrácení: 69_zmrzliny_rollback.sql (kategorii skryje, nic nemaže).
BEGIN;

INSERT INTO "product_categories" ("slug", "name", "intro", "sort_order", "is_active")
VALUES ('zmrzliny', 'Zmrzliny', '{}'::text[], 60, true)
ON CONFLICT ("slug") DO NOTHING;

COMMIT;
