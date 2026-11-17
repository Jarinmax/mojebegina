-- 129: Ekonomika – historie úprav a smazání (zadání Lucie 17. 11. 2026).
-- Jedna NOVÁ tabulka economy_entry_changes (kdo, kdy, stará a nová hodnota, důvod smazání).
-- Nic existujícího se nemění. Stejné DDL jako drizzle/0051_ekonomika_historie.sql.
-- Dá se spustit opakovaně: když tabulka už existuje, skript neudělá nic.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;
DO $$ BEGIN
IF to_regclass('public.economy_entry_changes') IS NULL THEN
  CREATE TABLE "economy_entry_changes" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"entry_id" uuid NOT NULL,
  	"action" text NOT NULL,
  	"changes" jsonb NOT NULL,
  	"reason" text,
  	"source" text DEFAULT 'agent' NOT NULL,
  	"changed_by_user_id" text,
  	"changed_by_name" text,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	CONSTRAINT "economy_entry_changes_action_check" CHECK ("economy_entry_changes"."action" IN ('update','delete'))
  );
  ALTER TABLE "economy_entry_changes" ADD CONSTRAINT "economy_entry_changes_entry_id_economy_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."economy_entries"("id") ON DELETE restrict ON UPDATE no action;
  CREATE INDEX "economy_entry_changes_entry_idx" ON "economy_entry_changes" USING btree ("entry_id","created_at");
END IF;
END $$;
COMMIT;
SELECT to_regclass('public.economy_entry_changes') IS NOT NULL AS ekonomika_historie_ok;
