-- ESHOP 1.0 — VRÁCENÍ 61_zmrzliny.sql: kategorii „Zmrzliny“ skryje (menu
-- ani stránka ji neukážou), nic nemaže. Znovu zobrazit = 61 je idempotentní,
-- proto: UPDATE … SET is_active = true.
BEGIN;
UPDATE "product_categories" SET "is_active" = false, "updated_at" = now() WHERE "slug" = 'zmrzliny';
COMMIT;
