CREATE TABLE "economy_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"entry_date" date NOT NULL,
	"title" text NOT NULL,
	"counterparty" text,
	"amount_hal" bigint NOT NULL,
	"amount_no_shipping_hal" bigint,
	"payment_form" text,
	"invoice_number" text,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "economy_entries_source_ref_key" UNIQUE("source","source_ref"),
	CONSTRAINT "economy_entries_kind_check" CHECK ("economy_entries"."kind" IN ('income','cost'))
);
--> statement-breakpoint
CREATE INDEX "economy_entries_kind_date_idx" ON "economy_entries" USING btree ("kind","entry_date");