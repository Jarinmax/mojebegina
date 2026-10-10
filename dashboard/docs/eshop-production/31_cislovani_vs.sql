-- PRODUCTION — ZAPNUTÍ ČÍSLOVÁNÍ: číslo objednávky = variabilní symbol.
-- Koncepce schválena 10. 10. 2026; SPUŠTĚNÍ ZATÍM NESCHVÁLENO.
-- Nahrazuje 20–29 (START navazující na WooCommerce) — ty se nespouští.
--
-- Jedno pravidlo pro všechny objednávky kromě importu:
--   číslo objednávky = VS = další hodnota řady payment_vs_seq
--   (70000001, 70000002, …), nezávislé na WordPressu.
--   eshop (pokladna i náhradní objednávka): VS přidělí aplikace, číslo = VS
--   manual (MojeBegina): VS i číslo přidělí trigger z téže řady
--   import (The Cup, historie): bez čísla i VS z řady; případné původní
--     číslo WooCommerce jen pod 70000000 → nikdy nekoliduje.
-- Kód aplikace se nemění — číslo doplní trigger.
--
-- Celý blok je jedna transakce: jakákoli pojistka nebo chyba → nic se nezmění.
DO $$
BEGIN
  -- Pojistky
  IF to_regclass('public.payment_vs_seq') IS NULL THEN
    RAISE EXCEPTION 'Chybí payment_vs_seq (migrace 0020) — zastavuji.';
  END IF;
  IF to_regclass('public.order_number_seq') IS NOT NULL THEN
    RAISE EXCEPTION 'Existuje order_number_seq (řada Preview / 21_numbering) — tady se tento skript nespouští.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'orders_assign_number') THEN
    RAISE EXCEPTION 'Číslování už je zapnuté (trigger orders_assign_number) — zastavuji.';
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE order_number IS NOT NULL) THEN
    RAISE EXCEPTION 'Některá objednávka už číslo má — zastavuji.';
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE channel = 'eshop' AND payment_vs IS NULL) THEN
    RAISE EXCEPTION 'E-shopová objednávka bez VS — zastavuji.';
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE channel = 'import' AND payment_vs IS NOT NULL) THEN
    RAISE EXCEPTION 'Importovaná objednávka s VS z řady — zastavuji.';
  END IF;

  -- Nová objednávka (kromě importu): bez VS dostane VS z řady; číslo = VS.
  CREATE FUNCTION orders_assign_number() RETURNS trigger LANGUAGE plpgsql AS $f$
  BEGIN
    IF NEW.channel <> 'import' THEN
      IF NEW.payment_vs IS NULL THEN
        NEW.payment_vs := '7' || lpad(nextval('payment_vs_seq')::text, 7, '0');
      END IF;
      IF NEW.order_number IS NULL THEN
        NEW.order_number := NEW.payment_vs::bigint;
      END IF;
    END IF;
    RETURN NEW;
  END $f$;
  CREATE TRIGGER orders_assign_number BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION orders_assign_number();

  -- Stávající objednávky: ruční bez VS dostanou VS z řady (podle data),
  -- pak všechny kromě importu číslo = VS.
  UPDATE orders o SET payment_vs = n.vs
  FROM (
    SELECT id, '7' || lpad(nextval('payment_vs_seq')::text, 7, '0') AS vs
    FROM (SELECT id FROM orders WHERE channel <> 'import' AND payment_vs IS NULL
          ORDER BY ordered_at, created_at, id) s
  ) n
  WHERE o.id = n.id;
  UPDATE orders SET order_number = payment_vs::bigint WHERE channel <> 'import';

  -- Přidělené číslo se nemění (VS je neměnný už od migrace 0020).
  CREATE FUNCTION orders_order_number_immutable() RETURNS trigger LANGUAGE plpgsql AS $f$
  BEGIN
    IF OLD.order_number IS NOT NULL AND NEW.order_number IS DISTINCT FROM OLD.order_number THEN
      RAISE EXCEPTION 'order_number je neměnný (objednávka %)', OLD.id;
    END IF;
    RETURN NEW;
  END $f$;
  CREATE TRIGGER orders_order_number_immutable BEFORE UPDATE OF order_number ON orders
    FOR EACH ROW EXECUTE FUNCTION orders_order_number_immutable();

  ALTER TABLE orders ADD CONSTRAINT orders_number_equals_vs
    CHECK (channel = 'import' OR (payment_vs IS NOT NULL AND order_number = payment_vs::bigint));
  ALTER TABLE orders ADD CONSTRAINT orders_import_outside_series
    CHECK (channel <> 'import' OR (payment_vs IS NULL AND (order_number IS NULL OR order_number < 70000000)));
END $$;
