-- ŠARŽE 1.0 — základ: výrobní šarže, výrobní příjem hotových výrobků na
-- sklad a auditní stopa. NESPUŠTĚNO. Návrh: SARZE_NAVRH.md (oddíl 12).
--
-- PŘEDPOKLAD: Sklad 1.0 je nasazený (migrace 0028 + 0029 z větve
-- integrace/sklad-1-0: stock_items, stock_locations, stock_movements…).
-- Kontrola předem: 10_before.sql. Vrácení: 19_rollback.sql.
--
-- Pravidla, která tahle migrace vynucuje přímo v databázi:
--   • číslo šarže L-RRRRMMDD-KÓD-NN (např. L-20261106-DYN-01):
--       RRRRMMDD = den dokončení výroby, KÓD = products.lot_code,
--       NN = pořadí várky téhož výrobku v ten den; číslo je neměnné;
--   • 1 šarže = 1 výrobní běh (začátek/konec výroby jsou přímo na šarži)
--     = 1 výrobek = nejvýš 1 platný výrobní příjem;
--   • šarže vzniká jako 'draft' (založená) a AKTIVNÍ (prodejná) se stane
--     jen potvrzením jejího příjmu (confirm_production_receipt) —
--     teprve tehdy vzniknou skladové pohyby;
--   • datum spotřeby nesmí přesáhnout začátek výroby + products.shelf_life_days;
--   • audit: každé založení a každá změna šarže, příjmu i řádku příjmu se
--     zapíše triggerem do production_batch_activity (staré → nové hodnoty,
--     kdo, kdy). Kdo = begina.actor_user_id nastavené v téže transakci;
--     bez něj DB změnu odmítne;
--   • nic se nemaže (šarže, příjmy, řádky, audit) a skladové pohyby se
--     nepřepisují — oprava = nový opravný pohyb (corrects_movement_id),
--     stejně jako ve Skladu 1.0.

-- ===== 1. Kód výrobku pro číslo šarže =====
ALTER TABLE products ADD COLUMN lot_code text;
--> statement-breakpoint
ALTER TABLE products ADD CONSTRAINT products_lot_code_format CHECK (lot_code IS NULL OR lot_code ~ '^[A-Z]{3,4}$');
--> statement-breakpoint
CREATE UNIQUE INDEX products_lot_code_key ON products (lot_code) WHERE lot_code IS NOT NULL;
--> statement-breakpoint

-- ===== 2. Hotový výrobek jako skladová položka Skladu 1.0 =====
ALTER TABLE stock_items DROP CONSTRAINT stock_items_kind_check;
--> statement-breakpoint
ALTER TABLE stock_items ADD CONSTRAINT stock_items_kind_check
  CHECK (kind IN ('stock_material', 'resale_goods', 'operating_supply', 'finished_product'));
--> statement-breakpoint
ALTER TABLE stock_items ADD CONSTRAINT stock_items_finished_has_variant
  CHECK (kind <> 'finished_product' OR linked_product_variant_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX stock_items_finished_variant_key ON stock_items (linked_product_variant_id)
  WHERE kind = 'finished_product';
--> statement-breakpoint

-- ===== 3. Výrobní šarže (= jeden výrobní běh) =====
CREATE TABLE production_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  lot_code text NOT NULL,
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  lot_sequence smallint NOT NULL,
  production_started_on date NOT NULL,
  production_finished_on date NOT NULL,
  production_started_at timestamp with time zone,
  production_finished_at timestamp with time zone,
  best_before date NOT NULL,
  output_volume_l numeric(10, 3),
  status text DEFAULT 'draft' NOT NULL,
  note text,
  created_by_user_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  activated_by_user_id text,
  activated_at timestamp with time zone,
  voided_by_user_id text,
  voided_at timestamp with time zone,
  void_reason text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT production_batches_lot_code_key UNIQUE (lot_code),
  CONSTRAINT production_batches_run_key UNIQUE (product_id, production_finished_on, lot_sequence),
  CONSTRAINT production_batches_lot_code_format CHECK (lot_code ~ '^L-[0-9]{8}-[A-Z]{3,4}-[0-9]{2}$'),
  CONSTRAINT production_batches_lot_code_date CHECK (substr(lot_code, 3, 8) = to_char(production_finished_on, 'YYYYMMDD')),
  CONSTRAINT production_batches_lot_code_sequence CHECK (right(lot_code, 2)::int = lot_sequence),
  CONSTRAINT production_batches_sequence_range CHECK (lot_sequence BETWEEN 1 AND 99),
  CONSTRAINT production_batches_run_dates CHECK (production_finished_on >= production_started_on
                                                 AND production_finished_on - production_started_on <= 1),
  CONSTRAINT production_batches_run_times CHECK (production_started_at IS NULL OR production_finished_at IS NULL
                                                 OR production_finished_at >= production_started_at),
  CONSTRAINT production_batches_best_before_after_production CHECK (best_before > production_finished_on),
  CONSTRAINT production_batches_volume_positive CHECK (output_volume_l IS NULL OR output_volume_l > 0),
  CONSTRAINT production_batches_status_check CHECK (status IN ('draft', 'active', 'blocked', 'recalled', 'closed', 'voided')),
  CONSTRAINT production_batches_activated_pair CHECK ((activated_by_user_id IS NULL) = (activated_at IS NULL)),
  CONSTRAINT production_batches_active_was_activated CHECK (status IN ('draft', 'voided') OR activated_at IS NOT NULL),
  CONSTRAINT production_batches_voided_pair CHECK ((voided_by_user_id IS NULL) = (voided_at IS NULL)),
  CONSTRAINT production_batches_voided_status CHECK ((status = 'voided') = (voided_at IS NOT NULL)),
  CONSTRAINT production_batches_voided_has_reason CHECK (voided_at IS NULL OR void_reason IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX production_batches_product_idx ON production_batches (product_id, production_finished_on);
--> statement-breakpoint

-- ===== 4. Auditní stopa (append-only) =====
CREATE TABLE production_batch_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  batch_id uuid NOT NULL REFERENCES production_batches (id) ON DELETE RESTRICT,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  kind text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  actor_user_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT production_batch_activity_entity_check CHECK (entity IN ('batch', 'receipt', 'receipt_line')),
  CONSTRAINT production_batch_activity_kind_check CHECK (kind IN ('created', 'updated', 'status_changed'))
);
--> statement-breakpoint
CREATE INDEX production_batch_activity_batch_idx ON production_batch_activity (batch_id, created_at);
--> statement-breakpoint

-- ===== 5. Výrobní příjem hotových výrobků na sklad =====
CREATE TABLE production_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  batch_id uuid NOT NULL REFERENCES production_batches (id) ON DELETE RESTRICT,
  stock_location_id uuid NOT NULL REFERENCES stock_locations (id) ON DELETE RESTRICT,
  status text DEFAULT 'draft' NOT NULL,
  note text,
  created_by_user_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  confirmed_by_user_id text,
  confirmed_at timestamp with time zone,
  voided_by_user_id text,
  voided_at timestamp with time zone,
  void_reason text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT production_receipts_status_check CHECK (status IN ('draft', 'confirmed', 'voided')),
  CONSTRAINT production_receipts_confirmed_pair CHECK ((confirmed_by_user_id IS NULL) = (confirmed_at IS NULL)),
  CONSTRAINT production_receipts_confirmed_status CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL),
  CONSTRAINT production_receipts_voided_pair CHECK ((voided_by_user_id IS NULL) = (voided_at IS NULL)),
  CONSTRAINT production_receipts_voided_status CHECK ((status = 'voided') = (voided_at IS NOT NULL)),
  CONSTRAINT production_receipts_voided_has_reason CHECK (voided_at IS NULL OR void_reason IS NOT NULL)
);
--> statement-breakpoint
-- jedna šarže = nejvýš jeden platný (nestornovaný) příjem
CREATE UNIQUE INDEX production_receipts_one_per_batch_key ON production_receipts (batch_id) WHERE status <> 'voided';
--> statement-breakpoint
CREATE TABLE production_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  receipt_id uuid NOT NULL REFERENCES production_receipts (id) ON DELETE RESTRICT,
  product_variant_id uuid NOT NULL REFERENCES product_variants (id) ON DELETE RESTRICT,
  stock_item_id uuid NOT NULL REFERENCES stock_items (id) ON DELETE RESTRICT,
  packages_count integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT production_receipt_lines_variant_key UNIQUE (receipt_id, product_variant_id),
  CONSTRAINT production_receipt_lines_packages_positive CHECK (packages_count > 0)
);
--> statement-breakpoint

-- ===== 6. Vazba skladových pohybů na šarži =====
ALTER TABLE stock_movements
  ADD COLUMN production_batch_id uuid REFERENCES production_batches (id) ON DELETE RESTRICT,
  ADD COLUMN production_receipt_id uuid REFERENCES production_receipts (id) ON DELETE RESTRICT,
  ADD COLUMN production_receipt_line_id uuid REFERENCES production_receipt_lines (id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_one_source
  CHECK (receipt_id IS NULL OR production_receipt_id IS NULL);
--> statement-breakpoint
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_production_line_has_batch
  CHECK (production_receipt_line_id IS NULL OR (production_receipt_id IS NOT NULL AND production_batch_id IS NOT NULL));
--> statement-breakpoint
CREATE INDEX stock_movements_production_batch_idx ON stock_movements (production_batch_id);
--> statement-breakpoint

-- ===== 7. Triggery =====

-- 7a. Kdo změnu dělá: begina.actor_user_id z téže transakce (povinné).
CREATE FUNCTION begina_actor_user_id() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := nullif(current_setting('begina.actor_user_id', true), '');
BEGIN
  IF v IS NULL THEN
    RAISE EXCEPTION 'Šarže: chybí begina.actor_user_id (SELECT set_config(''begina.actor_user_id'', ''<id uživatele>'', true);)';
  END IF;
  RETURN v;
END $$;
--> statement-breakpoint

-- 7b. Nic se nemaže / audit se nemění.
CREATE FUNCTION production_forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Šarže: % v tabulce % není dovoleno (záznam je auditní doklad)', TG_OP, TG_TABLE_NAME;
END $$;
--> statement-breakpoint
CREATE TRIGGER production_batches_no_delete BEFORE DELETE ON production_batches
  FOR EACH ROW EXECUTE FUNCTION production_forbid_change();
--> statement-breakpoint
CREATE TRIGGER production_receipts_no_delete BEFORE DELETE ON production_receipts
  FOR EACH ROW EXECUTE FUNCTION production_forbid_change();
--> statement-breakpoint
CREATE TRIGGER production_receipt_lines_no_delete BEFORE DELETE ON production_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION production_forbid_change();
--> statement-breakpoint
CREATE TRIGGER production_batch_activity_append_only BEFORE UPDATE OR DELETE ON production_batch_activity
  FOR EACH ROW EXECUTE FUNCTION production_forbid_change();
--> statement-breakpoint
-- Skladové pohyby se nikdy nepřepisují ani nemažou (Sklad 1.0 je jen
-- vkládá; storno = opačný pohyb s corrects_movement_id).
CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION production_forbid_change();
--> statement-breakpoint

-- 7c. Pravidla šarže.
CREATE FUNCTION production_batches_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_code text;
  v_shelf integer;
BEGIN
  SELECT lot_code, shelf_life_days INTO v_code, v_shelf FROM products WHERE id = NEW.product_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Šarže: výrobek nemá kód šarže (products.lot_code)';
  END IF;
  IF split_part(NEW.lot_code, '-', 3) <> v_code THEN
    RAISE EXCEPTION 'Šarže: kód % v čísle šarže % neodpovídá výrobku (%)', split_part(NEW.lot_code, '-', 3), NEW.lot_code, v_code;
  END IF;
  IF v_shelf IS NOT NULL AND NEW.best_before > NEW.production_started_on + v_shelf THEN
    RAISE EXCEPTION 'Šarže: datum spotřeby % je za trvanlivostí výrobku (nejpozději %)', NEW.best_before, NEW.production_started_on + v_shelf;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Šarže: nová šarže musí začít jako draft (aktivuje ji potvrzení příjmu)';
    END IF;
    RETURN NEW;
  END IF;

  -- identita šarže je neměnná
  IF NEW.lot_code IS DISTINCT FROM OLD.lot_code OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.lot_sequence IS DISTINCT FROM OLD.lot_sequence OR NEW.production_finished_on IS DISTINCT FROM OLD.production_finished_on
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Šarže %: číslo, výrobek, den dokončení a založení jsou neměnné', OLD.lot_code;
  END IF;
  -- po aktivaci se údaje z výroby už nemění
  IF OLD.status <> 'draft' AND (NEW.production_started_on IS DISTINCT FROM OLD.production_started_on
     OR NEW.production_started_at IS DISTINCT FROM OLD.production_started_at
     OR NEW.production_finished_at IS DISTINCT FROM OLD.production_finished_at
     OR NEW.best_before IS DISTINCT FROM OLD.best_before OR NEW.output_volume_l IS DISTINCT FROM OLD.output_volume_l) THEN
    RAISE EXCEPTION 'Šarže %: po aktivaci nejde měnit údaje o výrobě ani datum spotřeby', OLD.lot_code;
  END IF;
  -- povolené přechody stavů
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'draft'    AND NEW.status IN ('active', 'voided'))
    OR (OLD.status = 'active'   AND NEW.status IN ('blocked', 'recalled', 'closed'))
    OR (OLD.status = 'blocked'  AND NEW.status IN ('active', 'recalled'))
    OR (OLD.status = 'recalled' AND NEW.status = 'closed')) THEN
    RAISE EXCEPTION 'Šarže %: přechod % → % není dovolen', OLD.lot_code, OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'active' AND NOT EXISTS (
       SELECT 1 FROM production_receipts r WHERE r.batch_id = NEW.id AND r.status = 'confirmed') THEN
    RAISE EXCEPTION 'Šarže %: aktivovat jde jen potvrzením výrobního příjmu', OLD.lot_code;
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'voided' AND EXISTS (
       SELECT 1 FROM production_receipts r WHERE r.batch_id = NEW.id AND r.status <> 'voided') THEN
    RAISE EXCEPTION 'Šarže %: nejdřív stornovat její příjem', OLD.lot_code;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER production_batches_guard BEFORE INSERT OR UPDATE ON production_batches
  FOR EACH ROW EXECUTE FUNCTION production_batches_guard();
--> statement-breakpoint

-- 7d. Pravidla příjmu.
CREATE FUNCTION production_receipts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_batch_status text;
BEGIN
  SELECT status INTO v_batch_status FROM production_batches WHERE id = NEW.batch_id;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Výrobní příjem musí začít jako draft';
    END IF;
    IF v_batch_status <> 'draft' THEN
      RAISE EXCEPTION 'Výrobní příjem jde připravit jen k šarži ve stavu draft (je %)', v_batch_status;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.batch_id IS DISTINCT FROM OLD.batch_id OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Výrobní příjem: šarže a založení jsou neměnné';
  END IF;
  IF OLD.status <> 'draft' THEN
    -- potvrzený příjem už má skladové pohyby; storno přijde jako opravné
    -- pohyby (samostatná funkce v další etapě), ne úpravou příjmu
    RAISE EXCEPTION 'Výrobní příjem ve stavu % už nejde měnit', OLD.status;
  END IF;
  IF NEW.status = 'confirmed' AND current_setting('begina.confirming_production_receipt', true) IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'Výrobní příjem jde potvrdit jen funkcí confirm_production_receipt()';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER production_receipts_guard BEFORE INSERT OR UPDATE ON production_receipts
  FOR EACH ROW EXECUTE FUNCTION production_receipts_guard();
--> statement-breakpoint

CREATE FUNCTION production_receipt_lines_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_receipt_status text;
  v_batch_product uuid;
  v_variant_product uuid;
  v_item_kind text;
  v_item_variant uuid;
BEGIN
  SELECT r.status, b.product_id INTO v_receipt_status, v_batch_product
    FROM production_receipts r JOIN production_batches b ON b.id = r.batch_id WHERE r.id = NEW.receipt_id;
  IF v_receipt_status <> 'draft' THEN
    RAISE EXCEPTION 'Řádky výrobního příjmu jde měnit jen ve stavu draft (je %)', v_receipt_status;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.receipt_id IS DISTINCT FROM OLD.receipt_id THEN
    RAISE EXCEPTION 'Řádek výrobního příjmu nejde přesunout k jinému příjmu';
  END IF;
  SELECT product_id INTO v_variant_product FROM product_variants WHERE id = NEW.product_variant_id;
  IF v_variant_product IS DISTINCT FROM v_batch_product THEN
    RAISE EXCEPTION 'Balení na řádku příjmu nepatří k výrobku šarže';
  END IF;
  SELECT kind, linked_product_variant_id INTO v_item_kind, v_item_variant FROM stock_items WHERE id = NEW.stock_item_id;
  IF v_item_kind IS DISTINCT FROM 'finished_product' OR v_item_variant IS DISTINCT FROM NEW.product_variant_id THEN
    RAISE EXCEPTION 'Skladová položka řádku musí být hotový výrobek pro stejné balení';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER production_receipt_lines_guard BEFORE INSERT OR UPDATE ON production_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION production_receipt_lines_guard();
--> statement-breakpoint

-- 7e. Pohyb hotového výrobku musí nést šarži.
CREATE FUNCTION stock_movements_finished_requires_batch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.production_batch_id IS NULL AND EXISTS (
       SELECT 1 FROM stock_items i WHERE i.id = NEW.stock_item_id AND i.kind = 'finished_product') THEN
    RAISE EXCEPTION 'Pohyb hotového výrobku musí mít šarži (production_batch_id)';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER stock_movements_finished_requires_batch BEFORE INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION stock_movements_finished_requires_batch();
--> statement-breakpoint

-- 7f. Auditní zápis každé změny (staré → nové hodnoty jen u změněných sloupců).
CREATE FUNCTION production_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_actor text := begina_actor_user_id();
  v_new jsonb := to_jsonb(NEW) - 'updated_at';
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) - 'updated_at' END;
  v_entity text := CASE TG_TABLE_NAME WHEN 'production_batches' THEN 'batch'
                                      WHEN 'production_receipts' THEN 'receipt' ELSE 'receipt_line' END;
  v_batch uuid;
  v_kind text;
  v_old_changed jsonb := '{}'::jsonb;
  v_new_changed jsonb := '{}'::jsonb;
  k text;
BEGIN
  v_batch := CASE v_entity WHEN 'batch' THEN NEW.id
                           WHEN 'receipt' THEN (v_new ->> 'batch_id')::uuid
                           ELSE (SELECT batch_id FROM production_receipts WHERE id = (v_new ->> 'receipt_id')::uuid) END;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO production_batch_activity (batch_id, entity, entity_id, kind, new_values, actor_user_id)
    VALUES (v_batch, v_entity, NEW.id, 'created', v_new, v_actor);
    RETURN NEW;
  END IF;
  FOR k IN SELECT jsonb_object_keys(v_new) LOOP
    IF v_new -> k IS DISTINCT FROM v_old -> k THEN
      v_old_changed := v_old_changed || jsonb_build_object(k, v_old -> k);
      v_new_changed := v_new_changed || jsonb_build_object(k, v_new -> k);
    END IF;
  END LOOP;
  IF v_new_changed = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  v_kind := CASE WHEN v_new_changed ? 'status' THEN 'status_changed' ELSE 'updated' END;
  INSERT INTO production_batch_activity (batch_id, entity, entity_id, kind, old_values, new_values, actor_user_id)
  VALUES (v_batch, v_entity, NEW.id, v_kind, v_old_changed, v_new_changed, v_actor);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER production_batches_audit AFTER INSERT OR UPDATE ON production_batches
  FOR EACH ROW EXECUTE FUNCTION production_audit();
--> statement-breakpoint
CREATE TRIGGER production_receipts_audit AFTER INSERT OR UPDATE ON production_receipts
  FOR EACH ROW EXECUTE FUNCTION production_audit();
--> statement-breakpoint
CREATE TRIGGER production_receipt_lines_audit AFTER INSERT OR UPDATE ON production_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION production_audit();
--> statement-breakpoint

-- 7g. Kód výrobku se po založení první šarže už nemění (byl by v rozporu
-- s čísly vytištěnými na obalech).
CREATE FUNCTION products_lot_code_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lot_code IS DISTINCT FROM OLD.lot_code AND EXISTS (
       SELECT 1 FROM production_batches b WHERE b.product_id = OLD.id) THEN
    RAISE EXCEPTION 'Výrobek % už má šarže — kód % nejde změnit', OLD.slug, OLD.lot_code;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER products_lot_code_immutable BEFORE UPDATE OF lot_code ON products
  FOR EACH ROW EXECUTE FUNCTION products_lot_code_immutable();
--> statement-breakpoint

-- ===== 8. Potvrzení příjmu = skladové pohyby + aktivace šarže (vše najednou) =====
CREATE FUNCTION confirm_production_receipt(p_receipt_id uuid, p_user_id text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  r production_receipts%ROWTYPE;
  b production_batches%ROWTYPE;
  v_count integer;
BEGIN
  IF p_user_id IS NULL OR p_user_id = '' THEN
    RAISE EXCEPTION 'confirm_production_receipt: chybí uživatel';
  END IF;
  PERFORM set_config('begina.actor_user_id', p_user_id, true);
  SELECT * INTO r FROM production_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Výrobní příjem % neexistuje', p_receipt_id; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'Výrobní příjem už je ve stavu %', r.status; END IF;
  SELECT * INTO b FROM production_batches WHERE id = r.batch_id FOR UPDATE;
  IF b.status <> 'draft' THEN RAISE EXCEPTION 'Šarže % je ve stavu %, čeká se draft', b.lot_code, b.status; END IF;

  INSERT INTO stock_movements (stock_item_id, stock_location_id, direction, quantity, recorded_by_user_id,
                               production_batch_id, production_receipt_id, production_receipt_line_id, reason)
  SELECT l.stock_item_id, r.stock_location_id, 'in', l.packages_count, p_user_id,
         b.id, r.id, l.id, 'Výrobní příjem šarže ' || b.lot_code
  FROM production_receipt_lines l WHERE l.receipt_id = r.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RAISE EXCEPTION 'Výrobní příjem % nemá žádný řádek', p_receipt_id; END IF;

  PERFORM set_config('begina.confirming_production_receipt', r.id::text, true);
  UPDATE production_receipts SET status = 'confirmed', confirmed_by_user_id = p_user_id, confirmed_at = now() WHERE id = r.id;
  PERFORM set_config('begina.confirming_production_receipt', '', true);
  UPDATE production_batches SET status = 'active', activated_by_user_id = p_user_id, activated_at = now() WHERE id = b.id;
  RETURN v_count;
END $$;
--> statement-breakpoint

-- ===== 9. Zůstatek po šaržích (pohled, ne ukládaná hodnota) =====
CREATE VIEW production_batch_balances AS
SELECT
  b.id AS batch_id,
  b.lot_code,
  b.product_id,
  b.status AS batch_status,
  b.best_before,
  i.linked_product_variant_id AS product_variant_id,
  m.stock_location_id,
  SUM(CASE WHEN m.direction = 'in' AND m.production_receipt_id IS NOT NULL AND m.corrects_movement_id IS NULL
           THEN m.quantity ELSE 0 END) AS received_quantity,
  SUM(CASE WHEN m.direction = 'in' THEN m.quantity ELSE -m.quantity END) AS current_quantity
FROM production_batches b
JOIN stock_movements m ON m.production_batch_id = b.id
JOIN stock_items i ON i.id = m.stock_item_id
GROUP BY b.id, b.lot_code, b.product_id, b.status, b.best_before, i.linked_product_variant_id, m.stock_location_id;
