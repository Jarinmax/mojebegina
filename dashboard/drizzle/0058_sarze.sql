CREATE TABLE "production_batch_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"volume_ml" integer NOT NULL,
	"quantity" integer NOT NULL,
	"best_before" date,
	"sold_out_at" timestamp with time zone,
	CONSTRAINT "production_batch_lines_quantity_check" CHECK ("production_batch_lines"."quantity" > 0),
	CONSTRAINT "production_batch_lines_volume_check" CHECK ("production_batch_lines"."volume_ml" IN (100, 200, 500, 650, 3000))
);
--> statement-breakpoint
CREATE TABLE "production_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"produced_on" date NOT NULL,
	"note" text,
	"source" text DEFAULT 'web' NOT NULL,
	"source_ref" text,
	"created_by_user_id" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "production_batches_source_check" CHECK ("production_batches"."source" IN ('web','agent'))
);
--> statement-breakpoint
ALTER TABLE "production_batch_lines" ADD CONSTRAINT "production_batch_lines_batch_id_production_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."production_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "production_batch_lines_batch_volume_key" ON "production_batch_lines" USING btree ("batch_id","volume_ml");--> statement-breakpoint
CREATE UNIQUE INDEX "production_batches_code_key" ON "production_batches" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "production_batches_source_ref_key" ON "production_batches" USING btree ("source","source_ref") WHERE "production_batches"."source_ref" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "production_batches_produced_idx" ON "production_batches" USING btree ("produced_on");