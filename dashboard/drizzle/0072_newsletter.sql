-- Newsletter – souhlasy s odběrem (Jarin 28. 11. 2026, vlákno Newsletter a e-mail marketing).
-- Souhlas platí až po kliknutí v potvrzovacím e-mailu (double opt-in). Jeden řádek = jedna adresa.
CREATE TABLE IF NOT EXISTS "newsletter_subscribers" (
  "email" text PRIMARY KEY NOT NULL,
  "segment" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "source" text NOT NULL,
  "consent_text" text NOT NULL,
  "lead_id" uuid,
  "requested_by_user_id" text,
  "requested_by_name" text,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "confirm_sent_at" timestamp with time zone,
  "confirmed_at" timestamp with time zone,
  "confirmed_ip" text,
  "confirmed_user_agent" text,
  "unsubscribed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "newsletter_subscribers_email_lower_check" CHECK ("email" = lower("email")),
  CONSTRAINT "newsletter_subscribers_status_check" CHECK ("status" IN ('pending', 'confirmed', 'unsubscribed')),
  CONSTRAINT "newsletter_subscribers_segment_check" CHECK ("segment" IS NULL OR "segment" IN ('kavarna', 'domacnost')),
  CONSTRAINT "newsletter_subscribers_source_check" CHECK ("source" IN ('web', 'pro-kavarny', 'crm'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "newsletter_subscribers_confirmed_idx" ON "newsletter_subscribers" ("segment") WHERE "status" = 'confirmed';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "newsletter_subscribers_lead_idx" ON "newsletter_subscribers" ("lead_id");
