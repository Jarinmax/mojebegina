-- ESHOP 1.0 — VRÁCENÍ 21_migration.sql (krok B).
-- Vypne jen povinnost VS u e-shopové objednávky. Přidělené VS ZŮSTÁVAJÍ
-- (jsou neměnné a zákazníci s nimi mohou platit) — vrácení je proto vždy
-- bezpečné a nic nemaže. Krok A vrací až 19_rollback.sql.
BEGIN;
ALTER TABLE orders DROP CONSTRAINT orders_eshop_requires_vs;
COMMIT;
