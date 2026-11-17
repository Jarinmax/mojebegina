-- 125: Projekt Begina – jedna NOVÁ tabulka project_entries (stav, rozhodnutí a výstupy po oblastech).
-- Nic existujícího se nemění. Stejné DDL jako drizzle/0048_projekt_begina.sql. Dá se spustit opakovaně:
-- když tabulka už existuje, skript neudělá nic.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
DO $$ BEGIN
IF to_regclass('public.project_entries') IS NULL THEN
  CREATE TABLE "project_entries" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"area" text NOT NULL,
  	"kind" text NOT NULL,
  	"entry_date" date NOT NULL,
  	"title" text,
  	"body" text,
  	"url" text,
  	"source" text DEFAULT 'manual' NOT NULL,
  	"source_ref" text,
  	"created_by_user_id" text,
  	"created_by_name" text,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp with time zone,
  	CONSTRAINT "project_entries_source_ref_key" UNIQUE("source","source_ref"),
  	CONSTRAINT "project_entries_kind_check" CHECK ("project_entries"."kind" IN ('status','decision','output'))
  );
  CREATE INDEX "project_entries_area_kind_idx" ON "project_entries" USING btree ("area","kind","created_at");
END IF;
END $$;
COMMIT;
SELECT to_regclass('public.project_entries') IS NOT NULL AS project_entries_ok;
