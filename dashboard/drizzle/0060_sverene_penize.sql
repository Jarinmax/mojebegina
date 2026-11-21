CREATE TABLE "trust_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"kind" text NOT NULL,
	"amount_kc" integer NOT NULL,
	"description" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	CONSTRAINT "trust_entries_kind_check" CHECK ("trust_entries"."kind" IN ('deposit', 'withdrawal')),
	CONSTRAINT "trust_entries_amount_check" CHECK ("trust_entries"."amount_kc" > 0)
);
--> statement-breakpoint
CREATE TABLE "trust_recurring" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_kc" integer NOT NULL,
	"day_of_month" integer NOT NULL,
	"start_month" text NOT NULL,
	"end_month" text,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trust_recurring_amount_check" CHECK ("trust_recurring"."amount_kc" > 0),
	CONSTRAINT "trust_recurring_day_check" CHECK ("trust_recurring"."day_of_month" BETWEEN 1 AND 28),
	CONSTRAINT "trust_recurring_months_check" CHECK ("trust_recurring"."start_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND ("trust_recurring"."end_month" IS NULL OR ("trust_recurring"."end_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND "trust_recurring"."end_month" >= "trust_recurring"."start_month")))
);
--> statement-breakpoint
ALTER TABLE "trust_entries" ADD CONSTRAINT "trust_entries_card_id_collaborator_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."collaborator_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_recurring" ADD CONSTRAINT "trust_recurring_card_id_collaborator_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."collaborator_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trust_entries_card_date_idx" ON "trust_entries" USING btree ("card_id","entry_date");--> statement-breakpoint
CREATE INDEX "trust_recurring_card_idx" ON "trust_recurring" USING btree ("card_id");