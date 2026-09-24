CREATE TABLE "order_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"author_name" text,
	"kind" text NOT NULL,
	"body" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "entered_by_user_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_status" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "planned_delivery_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "responsible_user_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "order_activity" ADD CONSTRAINT "order_activity_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_activity_order_id_idx" ON "order_activity" USING btree ("order_id","created_at");--> statement-breakpoint

-- Bezpečný backfill `payment_status` ze starého `status` pro VŠECHNY
-- dosavadní objednávky (dnes na Production přesně 2, obě "paid" — ověřeno
-- read-only 24. 9. 2026). Prostá hodnotová shoda "paid" → "paid". Staré
-- "pending"/"cancelled" (dnes žádný řádek nemá, ale sloupec to připouštěl)
-- se mapuje na "unpaid" jako bezpečný, nikdy-nesprávný default — nejde
-- o skutečné rozlišení "nefakturováno" vs. "fakturováno, čeká se", to umí
-- rozlišit jen člověk. `status` sloupec mizí až v 0008, po tomhle backfillu.
UPDATE "orders" SET "payment_status" = CASE
  WHEN "status" = 'paid' THEN 'paid'
  ELSE 'unpaid'
END;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_status" SET NOT NULL;--> statement-breakpoint

-- Cílený backfill `fulfillment_status` VÝHRADNĚ pro tyto dva konkrétní,
-- ručně ověřené historické záznamy (The Cup s.r.o. / "Razítko Kavárna",
-- faktury 20260152 a 20260153, staré přes 3 týdny, prokazatelně dokončené
-- transakce) — schváleno explicitně jako jednorázový backfill podle ID,
-- NE jako obecné pravidlo "paid → delivered". Payment a fulfillment status
-- zůstávají nezávislé veličiny; každá budoucí objednávka se `status='paid'`
-- narodí s `fulfillment_status='new'` (sloupcový DEFAULT výše) a fulfillment
-- se musí nastavit zvlášť, ručně.
UPDATE "orders" SET "fulfillment_status" = 'delivered'
WHERE "id" IN (
  '329f54d5-5a7d-4522-a21e-b7ad9cde24e2',
  '984e3645-1f2f-4444-8e8e-eeac75165a0a'
);