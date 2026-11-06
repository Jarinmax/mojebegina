-- PRODUCTION main — Sklad 1.1 (hotové výrobky), migrace 0030 S POJISTKOU (VYGENEROVÁNO scripts/sklad-1-1-production/build-sql.mjs).
-- Obsah = přesně drizzle/0030_sklad_1_1_hotove_vyrobky.sql.
-- Jako PRVNÍ krok transakce kontrola: větev main (neon.timeline_id 70a96b3677653646e65343cae8e27182), Sklad 1.0 (0028+0029)
-- hotový a Sklad 1.1 ještě neexistuje. Na jiné větvi nebo podruhé se transakce zastaví a NIC se nezmění.
-- Jen přidává (2 tabulky stock_batches/stock_reservations, pohled stock_item_availability,
-- 4 nové sloupce na stock_movements) — stávající data (dodavatelé, karty, příjemky, pohyby) se nemění.
-- Před: 20_before.sql · po: 22_after.sql · vrácení: 29_rollback.sql.
-- Spouštět CELÉ najednou v Neon SQL Editoru (jedna transakce), JEN po výslovném schválení.

BEGIN;

-- ===== POJISTKA: jen Production main, jen jednou, jen po Skladu 1.0 =====
DO $guard$
DECLARE
  timeline text := current_setting('neon.timeline_id', true);
BEGIN
  IF timeline IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'STOP: tohle NENÍ Production větev main (neon.timeline_id = %). Nic se nezměnilo.', coalesce(timeline, 'neznámý');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'goods_receipts' AND column_name = 'reextraction_status') THEN
    RAISE EXCEPTION 'STOP: chybí Sklad 1.0 migrace 0028+0029 (goods_receipts.reextraction_status). Nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('stock_batches', 'stock_reservations')) THEN
    RAISE EXCEPTION 'STOP: Sklad 1.1 (hotové výrobky) už existuje (migrace už běžela?). Nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'OK: Production main, Sklad 1.0 hotový, Sklad 1.1 ještě ne — pokračuji migrací 0030.';
END
$guard$;

-- ===== 0030_sklad_1_1_hotove_vyrobky.sql =====
CREATE TABLE "stock_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"batch_code" text NOT NULL,
	"produced_at" date NOT NULL,
	"best_before_at" date NOT NULL,
	"note" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_batches_code_format" CHECK ("stock_batches"."batch_code" ~ '^[A-Z0-9][A-Z0-9-]*$')
);

CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"stock_location_id" uuid NOT NULL,
	"batch_id" uuid,
	"order_id" uuid NOT NULL,
	"quantity" numeric(14, 6) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"note" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_by_user_id" text,
	"released_at" timestamp with time zone,
	"release_reason" text,
	"fulfilled_by_movement_id" uuid,
	"fulfilled_at" timestamp with time zone,
	CONSTRAINT "stock_reservations_quantity_positive" CHECK ("stock_reservations"."quantity" > 0),
	CONSTRAINT "stock_reservations_status_check" CHECK ("stock_reservations"."status" IN ('active','fulfilled','released')),
	CONSTRAINT "stock_reservations_released_pair_check" CHECK (("stock_reservations"."released_at" IS NULL) = ("stock_reservations"."released_by_user_id" IS NULL)),
	CONSTRAINT "stock_reservations_released_status_check" CHECK (("stock_reservations"."status" = 'released') = ("stock_reservations"."released_at" IS NOT NULL)),
	CONSTRAINT "stock_reservations_fulfilled_status_check" CHECK (("stock_reservations"."status" = 'fulfilled') = ("stock_reservations"."fulfilled_at" IS NOT NULL AND "stock_reservations"."fulfilled_by_movement_id" IS NOT NULL))
);

ALTER TABLE "stock_items" DROP CONSTRAINT "stock_items_kind_check";
ALTER TABLE "stock_movements" ADD COLUMN "kind" text;
-- ===== Ruční doplněk (drizzle-kit sám vygeneruje "kind" rovnou jako NOT
-- NULL bez výchozí hodnoty, což by na neprázdné stock_movements spadlo —
-- Sklad 1.0 do téhle chvíle zapisoval pohyby JEN z příjemek, takže každý
-- existující řádek je buď přímo z potvrzení (žádný corrects_movement_id),
-- nebo reverzní pohyb ze storna (corrects_movement_id vyplněný). Doplnit
-- napřed, pak teprve NOT NULL. =====
UPDATE "stock_movements" SET "kind" = CASE WHEN "corrects_movement_id" IS NOT NULL THEN 'void_reversal' ELSE 'goods_receipt_in' END WHERE "kind" IS NULL;
ALTER TABLE "stock_movements" ALTER COLUMN "kind" SET NOT NULL;
ALTER TABLE "stock_movements" ADD COLUMN "batch_id" uuid;
ALTER TABLE "stock_movements" ADD COLUMN "responsible_user_id" text;
ALTER TABLE "stock_movements" ADD COLUMN "note" text;
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_stock_location_id_stock_locations_id_fk" FOREIGN KEY ("stock_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."stock_batches"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_fulfilled_by_movement_id_stock_movements_id_fk" FOREIGN KEY ("fulfilled_by_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE restrict ON UPDATE no action;
CREATE UNIQUE INDEX "stock_batches_code_key" ON "stock_batches" USING btree ("batch_code");
CREATE INDEX "stock_batches_item_idx" ON "stock_batches" USING btree ("stock_item_id");
CREATE INDEX "stock_reservations_item_location_idx" ON "stock_reservations" USING btree ("stock_item_id","stock_location_id");
CREATE INDEX "stock_reservations_order_idx" ON "stock_reservations" USING btree ("order_id");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."stock_batches"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "stock_movements_batch_idx" ON "stock_movements" USING btree ("batch_id");
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_kind_check" CHECK ("stock_items"."kind" IN ('stock_material','resale_goods','operating_supply','finished_good'));
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_kind_check" CHECK ("stock_movements"."kind" IN ('goods_receipt_in','production_in','dispatch_out','inventory_correction','void_reversal'));
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_correction_has_reason" CHECK ("stock_movements"."kind" <> 'inventory_correction' OR "stock_movements"."reason" IS NOT NULL);


-- ===== Ruční doplněk za vygenerované tabulky (stejný postup jako
-- 0028_sklad_1_0_zaklad.sql: stock_item_balances) =====

-- Fyzický / rezervovaný / volný stav (revize zadání, bod 5) za
-- (stock_item_id, stock_location_id). POHLED, ne ukládaný sloupec —
-- physical beze změny stock_item_balances, reserved = SUM aktivních
-- rezervací, free = physical - reserved, vždy dopočítané. FULL OUTER JOIN
-- přes sjednocené klíče, aby se v pohledu objevila i kombinace, co má
-- jen pohyby bez rezervace, nebo (teoreticky) jen rezervaci bez pohybu.
CREATE VIEW stock_item_availability AS
WITH physical AS (
  SELECT stock_item_id, stock_location_id, current_quantity
  FROM stock_item_balances
),
reserved AS (
  SELECT stock_item_id, stock_location_id, SUM(quantity) AS reserved_quantity
  FROM stock_reservations
  WHERE status = 'active'
  GROUP BY stock_item_id, stock_location_id
),
keys AS (
  SELECT stock_item_id, stock_location_id FROM physical
  UNION
  SELECT stock_item_id, stock_location_id FROM reserved
)
SELECT
  k.stock_item_id,
  k.stock_location_id,
  COALESCE(p.current_quantity, 0) AS physical_quantity,
  COALESCE(r.reserved_quantity, 0) AS reserved_quantity,
  COALESCE(p.current_quantity, 0) - COALESCE(r.reserved_quantity, 0) AS free_quantity
FROM keys k
LEFT JOIN physical p ON p.stock_item_id = k.stock_item_id AND p.stock_location_id = k.stock_location_id
LEFT JOIN reserved r ON r.stock_item_id = k.stock_item_id AND r.stock_location_id = k.stock_location_id;

COMMIT;
