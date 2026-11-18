-- 133 (spuštěno 18. 11. 2026, Lucie): objednávka 70000012 (Café Academia) zaplacena 11. 11. 2026
-- převodem s VS 20260210 (faktura 20260210, ověřeno ve Fio). Od téhož dne to páruje fioSync sám.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.'; END IF;
END $$;
UPDATE orders
SET payment_status = 'paid',
    paid_at = '2026-11-11 12:00:00+01',
    note = note || ' Zaplaceno 11. 11. 2026 převodem, faktura 20260210 (ověřeno ve Fio 18. 11. 2026).'
WHERE order_number = '70000012' AND payment_status = 'unpaid';
COMMIT;
SELECT order_number, payment_status, paid_at, note FROM orders WHERE order_number = '70000012';
