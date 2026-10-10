-- PRODUCTION — NÁVRAT číslování „číslo objednávky = VS“ (nové objednávky
-- přestanou dostávat číslo; VS dál ano). Technicky vratné kdykoli; jakmile
-- ale zákazník číslo viděl (e-mail, stránka objednávky), je OBCHODNĚ
-- NEVRATNÉ — přidělená čísla zůstávají. Řada payment_vs_seq se nemění,
-- takže při opětovném zapnutí žádné číslo nevznikne dvakrát.
BEGIN;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_number_required;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_number_equals_vs;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_number_range;
DROP TRIGGER IF EXISTS orders_assign_number ON orders;
DROP FUNCTION IF EXISTS orders_assign_number();
DROP TRIGGER IF EXISTS orders_order_number_immutable ON orders;
DROP FUNCTION IF EXISTS orders_order_number_immutable();
COMMIT;
