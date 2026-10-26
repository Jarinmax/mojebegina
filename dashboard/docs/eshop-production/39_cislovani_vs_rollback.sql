-- PRODUCTION — NÁVRAT číslování „číslo objednávky = VS“: nové objednávky
-- přestanou dostávat číslo (e-shop dál VS z aplikace, ruční nic — stav
-- před zapnutím). Technicky vratné kdykoli; jakmile ale zákazník číslo
-- viděl (e-mail, stránka objednávky), je OBCHODNĚ NEVRATNÉ — přidělená čísla
-- a VS zůstávají. Řada payment_vs_seq se nevrací, takže žádné číslo
-- nevznikne dvakrát.
BEGIN;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_number_equals_vs;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_import_outside_series;
DROP TRIGGER IF EXISTS orders_assign_number ON orders;
DROP FUNCTION IF EXISTS orders_assign_number();
DROP TRIGGER IF EXISTS orders_order_number_immutable ON orders;
DROP FUNCTION IF EXISTS orders_order_number_immutable();
COMMIT;
