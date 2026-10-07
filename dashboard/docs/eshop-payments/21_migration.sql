-- ESHOP 1.0 — platby a fakturace, KROK B: povinný VS u e-shopové objednávky.
--
-- SPOUŠTĚT AŽ PO NASAZENÍ KÓDU, který VS přiděluje (pokladna na této
-- větvi), a po jedné testovací objednávce — kontrola 20_before.sql to
-- ověří (nejnovější e-shopová objednávka už VS má). Dřív by stará pokladna
-- objednávku bez VS neuložila.
--
-- Spouští vedení v Neon SQL Editoru CELÝ soubor najednou, jen na Preview.
-- Jedna transakce: chyba = nic se nezmění. Kontrola po: 22_after.sql.
-- Vrácení: 29_rollback.sql.
BEGIN;

-- 1. Starší e-shopové objednávky bez VS dostanou VS z řady, v pořadí,
--    v jakém vznikly (na Preview jen testovací objednávky).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM orders WHERE channel = 'eshop' AND payment_vs IS NULL ORDER BY ordered_at, created_at, id LOOP
    UPDATE orders SET payment_vs = '7' || lpad(nextval('payment_vs_seq')::text, 7, '0') WHERE id = r.id;
  END LOOP;
END $$;

-- 2. E-shopová objednávka bez VS už nevznikne.
ALTER TABLE orders ADD CONSTRAINT orders_eshop_requires_vs
  CHECK (channel <> 'eshop' OR payment_vs IS NOT NULL);

COMMIT;
