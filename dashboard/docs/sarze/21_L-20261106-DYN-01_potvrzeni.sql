-- ŠARŽE L-20261106-DYN-01 — POTVRZENÍ výrobního příjmu 38 ks.
-- NESPOUŠTĚT, dokud to Jaroslav Viner výslovně nepotvrdí (kusy fyzicky
-- přepočítané, štítky s číslem šarže a datem spotřeby 19. 11. 2026 nalepené).
-- Jedna funkce v jedné transakci: vloží skladový pohyb +38 ks (nic
-- nepřepisuje), potvrdí příjem, aktivuje šarži a zapíše audit.

BEGIN;

SELECT confirm_production_receipt(r.id, 'de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c') AS vytvorenych_pohybu -- Jaroslav Viner
FROM production_receipts r
JOIN production_batches b ON b.id = r.batch_id
WHERE b.lot_code = 'L-20261106-DYN-01' AND r.status = 'draft';

-- Kontrola: active | confirmed | 38 | 38
SELECT b.lot_code, b.status AS sarze, r.status AS prijem, z.received_quantity AS prijato, z.current_quantity AS skladem
FROM production_batches b
JOIN production_receipts r ON r.batch_id = b.id AND r.status = 'confirmed'
JOIN production_batch_balances z ON z.batch_id = b.id
WHERE b.lot_code = 'L-20261106-DYN-01';

COMMIT;
