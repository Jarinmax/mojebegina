-- PRODUCTION — ZAPNUTÍ ČÍSLOVÁNÍ: číslo objednávky = variabilní symbol.
-- Návrh 10. 10. 2026, NESPOUŠTĚT BEZ SCHVÁLENÍ. Nahrazuje 20–29
-- (START navazující na WooCommerce) — ty pak nespouštět.
--
-- Jedna řada pro všechno: payment_vs_seq (70000001, 70000002, …), nezávislá
-- na WordPressu. E-shopová objednávka má číslo = svůj VS (zákazník vidí
-- jedno číslo). Ruční objednávka z MojeBegina dostane další číslo z téže
-- řady (VS se jí nezapisuje — platí se podle faktury). Import (The Cup)
-- zůstane bez čísla. Kód aplikace se nemění: číslo doplní trigger.
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

  -- Nová objednávka (kromě importu): číslo = VS, bez VS další číslo z řady.
  CREATE FUNCTION orders_assign_number() RETURNS trigger LANGUAGE plpgsql AS $f$
  BEGIN
    IF NEW.channel <> 'import' AND NEW.order_number IS NULL THEN
      NEW.order_number := coalesce(NEW.payment_vs, '7' || lpad(nextval('payment_vs_seq')::text, 7, '0'))::bigint;
    END IF;
    RETURN NEW;
  END $f$;
  CREATE TRIGGER orders_assign_number BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION orders_assign_number();

  -- Stávající objednávky: e-shop (a cokoli s VS) = svůj VS; ruční bez VS
  -- další čísla z řady podle data.
  UPDATE orders SET order_number = payment_vs::bigint
  WHERE channel <> 'import' AND payment_vs IS NOT NULL;
  UPDATE orders o SET order_number = n.num
  FROM (
    SELECT id, ('7' || lpad(nextval('payment_vs_seq')::text, 7, '0'))::bigint AS num
    FROM (SELECT id FROM orders WHERE channel <> 'import' AND order_number IS NULL
          ORDER BY ordered_at, created_at, id) s
  ) n
  WHERE o.id = n.id;

  -- Přidělené číslo se nemění (jako VS).
  CREATE FUNCTION orders_order_number_immutable() RETURNS trigger LANGUAGE plpgsql AS $f$
  BEGIN
    IF OLD.order_number IS NOT NULL AND NEW.order_number IS DISTINCT FROM OLD.order_number THEN
      RAISE EXCEPTION 'order_number je neměnný (objednávka %)', OLD.id;
    END IF;
    RETURN NEW;
  END $f$;
  CREATE TRIGGER orders_order_number_immutable BEFORE UPDATE OF order_number ON orders
    FOR EACH ROW EXECUTE FUNCTION orders_order_number_immutable();

  ALTER TABLE orders ADD CONSTRAINT orders_number_required
    CHECK (channel = 'import' OR order_number IS NOT NULL);
  ALTER TABLE orders ADD CONSTRAINT orders_number_equals_vs
    CHECK (payment_vs IS NULL OR order_number = payment_vs::bigint);
  ALTER TABLE orders ADD CONSTRAINT orders_number_range
    CHECK (order_number IS NULL OR order_number BETWEEN 70000001 AND 79999999);
END $$;
