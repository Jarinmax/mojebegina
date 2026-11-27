-- Várky – rozpracované vaření uložené v databázi (Jarin 27. 11. 2026: „cokoliv se stane, potřebuju vidět, kde jsem skončil“)
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_runs_open_idx" ON "production_runs" ("started_at") WHERE "finished_at" IS NULL AND "cancelled_at" IS NULL;
