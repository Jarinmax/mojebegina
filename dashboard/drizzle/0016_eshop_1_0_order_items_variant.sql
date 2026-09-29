ALTER TABLE "order_items" ADD COLUMN "product_variant_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "sku_snapshot" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_product_variant_idx" ON "order_items" USING btree ("product_variant_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_line_total_consistent" CHECK ("order_items"."line_total_kc" = "order_items"."quantity" * "order_items"."unit_price_kc");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_has_sku" CHECK ("order_items"."product_variant_id" IS NULL OR "order_items"."sku_snapshot" IS NOT NULL);