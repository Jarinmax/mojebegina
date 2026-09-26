-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Návrat kroku 3. Vratné jen dokud neexistuje žádný systémový/zákaznický
-- záznam (author_user_id IS NULL) — jinak SET NOT NULL selže. Kontrola:
--   SELECT count(*) FROM order_activity WHERE author_user_id IS NULL;
ALTER TABLE order_activity DROP CONSTRAINT order_activity_user_has_author;
ALTER TABLE order_activity ALTER COLUMN author_user_id SET NOT NULL;
ALTER TABLE order_activity DROP CONSTRAINT order_activity_actor_type_check;
ALTER TABLE order_activity DROP COLUMN actor_type;
