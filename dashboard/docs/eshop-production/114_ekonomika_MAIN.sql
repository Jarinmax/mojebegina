-- 114: Ekonomika – nová tabulka pro příjmy a náklady (jen nová tabulka, nic existujícího se nemění).
-- Stejné DDL jako drizzle/0040_ekonomika.sql. Dá se spustit opakovaně.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS "economy_entries" (
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
CREATE INDEX IF NOT EXISTS "economy_entries_kind_date_idx" ON "economy_entries" USING btree ("kind","entry_date");
COMMIT;
SELECT count(*) AS radku_v_ekonomice FROM economy_entries;
