ALTER TABLE "orders" ADD COLUMN "order_number" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders" USING btree ("order_number");