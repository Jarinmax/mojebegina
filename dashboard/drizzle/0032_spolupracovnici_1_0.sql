CREATE TABLE "collaborator_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"assignee_user_id" text,
	"supplier_contact_name" text,
	"default_commission_percent" integer DEFAULT 20 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collaborator_cards_assignee_user_id_unique" UNIQUE("assignee_user_id"),
	CONSTRAINT "collaborator_cards_commission_percent_check" CHECK ("collaborator_cards"."default_commission_percent" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "collaborator_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"amount_kc" integer NOT NULL,
	"note" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collaborator_payouts_amount_check" CHECK ("collaborator_payouts"."amount_kc" > 0)
);
--> statement-breakpoint
CREATE TABLE "collaborator_product_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_sale_price_kc" integer,
	"commission_percent_snapshot" integer,
	"commission_kc" integer DEFAULT 0 NOT NULL,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collaborator_product_movements_kind_check" CHECK ("collaborator_product_movements"."kind" IN ('stock_in','sale','adjustment')),
	CONSTRAINT "collaborator_product_movements_quantity_check" CHECK ("collaborator_product_movements"."quantity" <> 0),
	CONSTRAINT "collaborator_product_movements_price_check" CHECK ("collaborator_product_movements"."unit_sale_price_kc" IS NULL OR "collaborator_product_movements"."unit_sale_price_kc" >= 0),
	CONSTRAINT "collaborator_product_movements_commission_check" CHECK ("collaborator_product_movements"."commission_kc" >= 0)
);
--> statement-breakpoint
CREATE TABLE "collaborator_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"name" text NOT NULL,
	"commission_percent" integer DEFAULT 20 NOT NULL,
	"low_stock_threshold" integer DEFAULT 10 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collaborator_products_commission_check" CHECK ("collaborator_products"."commission_percent" BETWEEN 0 AND 100),
	CONSTRAINT "collaborator_products_low_stock_check" CHECK ("collaborator_products"."low_stock_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "collaborator_work_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"description" text NOT NULL,
	"post_count" integer DEFAULT 1 NOT NULL,
	"duration_minutes" integer NOT NULL,
	"earned_kc" integer DEFAULT 0 NOT NULL,
	"occurred_on" date NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collaborator_work_entries_post_count_check" CHECK ("collaborator_work_entries"."post_count" >= 0),
	CONSTRAINT "collaborator_work_entries_duration_check" CHECK ("collaborator_work_entries"."duration_minutes" >= 0),
	CONSTRAINT "collaborator_work_entries_earned_check" CHECK ("collaborator_work_entries"."earned_kc" >= 0)
);
--> statement-breakpoint
ALTER TABLE "collaborator_payouts" ADD CONSTRAINT "collaborator_payouts_card_id_collaborator_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."collaborator_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborator_product_movements" ADD CONSTRAINT "collaborator_product_movements_product_id_collaborator_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."collaborator_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborator_products" ADD CONSTRAINT "collaborator_products_card_id_collaborator_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."collaborator_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborator_work_entries" ADD CONSTRAINT "collaborator_work_entries_card_id_collaborator_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."collaborator_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collaborator_payouts_card_date_idx" ON "collaborator_payouts" USING btree ("card_id","paid_at");--> statement-breakpoint
CREATE INDEX "collaborator_product_movements_product_date_idx" ON "collaborator_product_movements" USING btree ("product_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "collaborator_products_card_name_idx" ON "collaborator_products" USING btree ("card_id","name");--> statement-breakpoint
CREATE INDEX "collaborator_work_entries_card_date_idx" ON "collaborator_work_entries" USING btree ("card_id","occurred_on");
--> statement-breakpoint
INSERT INTO "collaborator_cards" (
	"id", "display_name", "supplier_contact_name", "default_commission_percent"
) VALUES (
	'6c756369-652d-4000-8000-000000000001',
	'Lucie – sociální sítě, med a svíčky',
	'Adam',
	20
) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "collaborator_products" (
	"id", "card_id", "name", "commission_percent", "low_stock_threshold"
) VALUES
	('6c756369-652d-4000-8000-000000000101', '6c756369-652d-4000-8000-000000000001', 'Med', 20, 10),
	('6c756369-652d-4000-8000-000000000102', '6c756369-652d-4000-8000-000000000001', 'Medová svíčka', 20, 10)
ON CONFLICT ("card_id", "name") DO NOTHING;
