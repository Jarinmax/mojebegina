ALTER TABLE "organizations" ADD COLUMN "dic" text;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_external_woocommerce_id_key" ON "orders" USING btree ("external_woocommerce_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_dic_format" CHECK ("organizations"."dic" IS NULL OR "organizations"."dic" ~ '^[A-Z]{2}[0-9A-Z]{2,13}$');