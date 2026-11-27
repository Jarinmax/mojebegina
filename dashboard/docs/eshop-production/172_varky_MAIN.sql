-- 172 (27. 11. 2026, Jarin): Várky – rozpracované vaření se ukládá do databáze.
-- Vytvoří NOVOU tabulku production_runs. Nic nemaže ani nemění.
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production), jen jednou — PŘED nasazením.
BEGIN;

DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS "production_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipe_slug" text NOT NULL,
  "recipe_name" text NOT NULL,
  "category" text NOT NULL,
  "batch_count" integer NOT NULL,
  "batch_ml" integer NOT NULL,
  "items" jsonb NOT NULL,
  "steps" text[] DEFAULT '{}'::text[] NOT NULL,
  "checks" text[] DEFAULT '{}'::text[] NOT NULL,
  "done_items" integer[] DEFAULT '{}'::integer[] NOT NULL,
  "done_steps" integer[] DEFAULT '{}'::integer[] NOT NULL,
  "started_by" text NOT NULL,
  "started_by_name" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  CONSTRAINT "production_runs_batch_count_check" CHECK ("batch_count" BETWEEN 1 AND 100)
);
CREATE INDEX IF NOT EXISTS "production_runs_open_idx" ON "production_runs" ("started_at") WHERE "finished_at" IS NULL AND "cancelled_at" IS NULL;

COMMIT;

-- Kontrola: má vrátit true.
SELECT to_regclass('public.production_runs') IS NOT NULL AS varky_tabulka_existuje;
