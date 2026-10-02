-- PRODUCTION — NÁVRAT číslování (vypne přidělování čísel).
-- Technicky vratné kdykoli; jakmile ale zákazník dostal číslo (e-mail, QR,
-- faktura), je to OBCHODNĚ NEVRATNÉ — přidělená čísla zůstávají a znovu se
-- nesmí použít. Před dalším zapnutím zvolit START nad nejvyšším číslem.
-- Nejdřív vypnout e-shop (ESHOP_ORDER_WRITE ve Vercelu), jinak nové objednávky
-- nedostanou číslo.
BEGIN;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_number_required;
ALTER TABLE orders ALTER COLUMN order_number DROP DEFAULT;
DROP SEQUENCE IF EXISTS order_number_seq;
COMMIT;
