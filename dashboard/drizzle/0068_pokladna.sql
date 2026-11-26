CREATE TABLE "pos_day_closes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_date" date NOT NULL,
	"cash_hal" integer NOT NULL,
	"card_hal" integer NOT NULL,
	"qr_hal" integer NOT NULL,
	"receipt_count" integer NOT NULL,
	"cash_counted_hal" integer,
	"note" text,
	"closed_by_name" text,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_day_closes_date" UNIQUE("business_date")
);
--> statement-breakpoint
CREATE TABLE "pos_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"price_hal" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_items_price_check" CHECK ("pos_items"."price_hal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pos_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"item_id" uuid,
	"name" text NOT NULL,
	"unit_price_hal" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_hal" integer NOT NULL,
	CONSTRAINT "pos_receipt_lines_qty_check" CHECK ("pos_receipt_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "pos_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"seq" integer NOT NULL,
	"business_date" date NOT NULL,
	"payment_method" text NOT NULL,
	"total_hal" integer NOT NULL,
	"cash_given_hal" integer,
	"note" text,
	"cashier_user_id" text NOT NULL,
	"cashier_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_name" text,
	"cancel_reason" text,
	"eet_status" text,
	"eet_sent_at" timestamp with time zone,
	"eet_response" jsonb,
	CONSTRAINT "pos_receipts_year_seq" UNIQUE("year","seq"),
	CONSTRAINT "pos_receipts_method_check" CHECK ("pos_receipts"."payment_method" IN ('cash','card','qr')),
	CONSTRAINT "pos_receipts_total_check" CHECK ("pos_receipts"."total_hal" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pos_receipt_lines" ADD CONSTRAINT "pos_receipt_lines_receipt_id_pos_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."pos_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_receipt_lines" ADD CONSTRAINT "pos_receipt_lines_item_id_pos_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pos_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pos_items_category_idx" ON "pos_items" USING btree ("category","sort_order");--> statement-breakpoint
CREATE INDEX "pos_receipt_lines_receipt_idx" ON "pos_receipt_lines" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "pos_receipts_date_idx" ON "pos_receipts" USING btree ("business_date");