ALTER TABLE "orders" ADD COLUMN "channel" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_method_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_method_label" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method_label" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_kc" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "age_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_channel_check" CHECK ("orders"."channel" IN ('manual', 'eshop', 'import'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_nonnegative" CHECK ("orders"."discount_kc" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_consistent" CHECK ("orders"."total_kc" = "orders"."subtotal_kc" - "orders"."discount_kc" + "orders"."shipping_kc");--> statement-breakpoint
-- Ručně doplněno: dvě objednávky The Cup nahrané importem 18. 9. 2026
-- (entered_by_user_id IS NULL, ověřeno 27. 9. 2026). Explicitně podle id,
-- ne heuristikou; v DB bez těchto objednávek nic nezmění.
UPDATE "orders" SET "channel" = 'import'
WHERE "id" IN ('329f54d5-5a7d-4522-a21e-b7ad9cde24e2', '984e3645-1f2f-4444-8e8e-eeac75165a0a');
