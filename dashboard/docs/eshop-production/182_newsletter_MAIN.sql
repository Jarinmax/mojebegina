-- 182 (28. 11. 2026, Jarin): Newsletter – souhlasy s odběrem (potvrzení e-mailem).
-- Vytvoří NOVOU tabulku newsletter_subscribers. Nic nemaže ani nemění.
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production), jen jednou — PŘED nasazením.
BEGIN;

DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
END $$;
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
CREATE INDEX IF NOT EXISTS "newsletter_subscribers_confirmed_idx" ON "newsletter_subscribers" ("segment") WHERE "status" = 'confirmed';
CREATE INDEX IF NOT EXISTS "newsletter_subscribers_lead_idx" ON "newsletter_subscribers" ("lead_id");

COMMIT;

-- Kontrola (má vrátit 1 řádek s 0):
SELECT count(*) AS radku FROM newsletter_subscribers;
