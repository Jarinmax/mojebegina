-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Krok 3 (drizzle 0013): systémové záznamy v order_activity. Existující řádky
-- dostanou actor_type = 'user' (default) a dál musí mít autora.
ALTER TABLE order_activity ADD COLUMN actor_type text NOT NULL DEFAULT 'user';
ALTER TABLE order_activity ADD CONSTRAINT order_activity_actor_type_check
  CHECK (actor_type IN ('user', 'system', 'customer'));
ALTER TABLE order_activity ALTER COLUMN author_user_id DROP NOT NULL;
ALTER TABLE order_activity ADD CONSTRAINT order_activity_user_has_author
  CHECK (actor_type <> 'user' OR author_user_id IS NOT NULL);
