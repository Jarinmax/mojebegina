CREATE TABLE "production_batch_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_line_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_batch_allocations_quantity_check" CHECK ("production_batch_allocations"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "production_batch_lines" ADD COLUMN "sold_out_auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "production_batch_allocations" ADD CONSTRAINT "production_batch_allocations_batch_line_id_production_batch_lines_id_fk" FOREIGN KEY ("batch_line_id") REFERENCES "public"."production_batch_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_allocations" ADD CONSTRAINT "production_batch_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_allocations" ADD CONSTRAINT "production_batch_allocations_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "production_batch_allocations_line_item_key" ON "production_batch_allocations" USING btree ("batch_line_id","order_item_id");--> statement-breakpoint
CREATE INDEX "production_batch_allocations_order_idx" ON "production_batch_allocations" USING btree ("order_id");