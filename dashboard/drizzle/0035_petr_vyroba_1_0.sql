CREATE TABLE "production_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"assignee_user_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_cards_assignee_user_id_unique" UNIQUE("assignee_user_id")
);
--> statement-breakpoint
CREATE TABLE "production_stock_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"stock_item_id" uuid,
	"note" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "production_stock_requests_status_check" CHECK ("production_stock_requests"."status" IN ('open','done')),
	CONSTRAINT "production_stock_requests_resolved_consistent" CHECK (("production_stock_requests"."status" = 'done') = ("production_stock_requests"."resolved_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "production_stock_requests" ADD CONSTRAINT "production_stock_requests_card_id_production_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."production_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stock_requests" ADD CONSTRAINT "production_stock_requests_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_stock_requests_card_status_idx" ON "production_stock_requests" USING btree ("card_id","status","created_at");
--> statement-breakpoint
INSERT INTO "production_cards" (
	"id", "display_name"
) VALUES (
	'70657472-2d76-4000-8000-000000000001',
	'Petr – výroba a kuchyně'
) ON CONFLICT ("id") DO NOTHING;